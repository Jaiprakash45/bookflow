import { pool } from "../../config/db.js"
import asyncHandler from "../../utilis/asyncHandler.js"
import ApiError from "../../utilis/ApiError.js"
import ApiResponse from "../../utilis/ApiResponse.js"

// ─────────────────────────────────────────────────────────────
// BOOK SEAT — PESSIMISTIC LOCKING
// Strategy: Lock the row first, then check, then book
// Use when: High contention — many users booking same seat
// ─────────────────────────────────────────────────────────────

const bookSeatPessimistic = asyncHandler(async (req, res) => {
  // 1. Get seat id from request body
  // 2. Get a dedicated client from pool (needed for transactions)
  // 3. Start transaction with REPEATABLE READ isolation
  // 4. Lock the seat row with SELECT FOR UPDATE
  //    — no other transaction can touch this row until we commit
  // 5. Check if seat is still available
  // 6. If not available → rollback → return error
  // 7. If available → mark seat as booked
  // 8. Create booking record
  // 9. Commit transaction → all changes saved together
  // 10. If anything fails → rollback → return error

  const { seat_id } = req.body
  const user_id = req.user.id

  // Step 1 — validate
  if (!seat_id) {
    throw new ApiError(400, "seat_id is required")
  }

  // Step 2 — get dedicated client for transaction
  // we cannot use pool.query() for transactions
  // because pool might use different connections for each query
  // we need same connection for BEGIN → COMMIT to work
  const client = await pool.connect()

  try {
    // Step 3 — start transaction with REPEATABLE READ
    // REPEATABLE READ ensures our seat read is consistent
    // throughout the entire transaction
    await client.query("BEGIN")
    await client.query(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"
    )

    // Step 4 — SELECT FOR UPDATE
    // This is pessimistic locking
    // This query does two things at once:
    // a) reads the seat row
    // b) locks it — nobody else can UPDATE or lock this row
    //    until our transaction ends
    // If another transaction already locked it → we WAIT here
    const seatResult = await client.query(
      `SELECT * FROM seats 
       WHERE id = $1 
       FOR UPDATE`,
      [seat_id]
    )

    // Step 5 — check if seat exists
    if (seatResult.rows.length === 0) {
      throw new ApiError(404, "Seat not found")
    }

    const seat = seatResult.rows[0]

    // Step 6 — check if seat is available
    // this check is now safe because we hold the lock
    // no other transaction can change this seat's status
    // between our read and our write
    if (seat.status !== "available") {
      throw new ApiError(
        409,
        `Seat is already ${seat.status} — try another seat`
      )
    }

    // Step 7 — mark seat as booked
    await client.query(
      `UPDATE seats 
       SET status = 'booked' 
       WHERE id = $1`,
      [seat_id]
    )

    // Step 8 — create booking record
    // store price at booking time — not current price
    // this protects user if price changes mid checkout
    const bookingResult = await client.query(
      `INSERT INTO bookings (user_id, seat_id, status, amount_paise)
       VALUES ($1, $2, 'confirmed', $3)
       RETURNING *`,
      [user_id, seat_id, seat.price_paise]
    )

    // Step 9 — commit → saves seat update + booking insert together
    // if commit fails → postgres automatically rolls back
    await client.query("COMMIT")

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          booking: bookingResult.rows[0],
          seat: {
            id: seat.id,
            label: seat.label,
            category: seat.category,
          },
        },
        "Seat booked successfully using pessimistic locking 🔒"
      )
    )
  } catch (error) {
    // Step 10 — rollback on any error
    // this undoes BOTH the seat update and booking insert
    // database goes back to exactly how it was before BEGIN
    await client.query("ROLLBACK")
    throw error
  } finally {
    // always release client back to pool
    // forgetting this causes pool exhaustion
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────
// BOOK SEAT — OPTIMISTIC LOCKING
// Strategy: No lock on read. Check version on write.
// Use when: Low contention — conflicts are rare
// ─────────────────────────────────────────────────────────────

const bookSeatOptimistic = asyncHandler(async (req, res) => {
  // 1. Get seat id from body
  // 2. Read seat WITHOUT locking
  // 3. Check if available
  // 4. Try to update — but only if version hasn't changed
  //    version changes when someone else updates the row
  // 5. If 0 rows updated → someone else booked it → conflict
  // 6. If 1 row updated → we won → create booking record
  // 7. Commit

  const { seat_id } = req.body
  const user_id = req.user.id

  // Step 1 — validate
  if (!seat_id) {
    throw new ApiError(400, "seat_id is required")
  }

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Step 2 — read seat WITHOUT FOR UPDATE
    // no lock here — we are being optimistic
    // we assume nobody else will change it at the same time
    const seatResult = await client.query(
      `SELECT * FROM seats WHERE id = $1`,
      [seat_id]
    )

    if (seatResult.rows.length === 0) {
      throw new ApiError(404, "Seat not found")
    }

    const seat = seatResult.rows[0]

    // Step 3 — check availability
    if (seat.status !== "available") {
      throw new ApiError(
        409,
        `Seat is already ${seat.status} — try another seat`
      )
    }

    // Step 4 — update WITH version check
    // this is the key line of optimistic locking
    // we only update if:
    //   a) seat id matches
    //   b) version is still the same as when we read it
    // if another transaction updated this row between our
    // read and this write → version changed → 0 rows updated
    const updateResult = await client.query(
      `UPDATE seats
       SET status = 'booked',
           version = version + 1
       WHERE id = $1
       AND version = $2
       AND status = 'available'`,
      [seat_id, seat.version]
    )

    // Step 5 — check if update actually happened
    // rowCount === 0 means version changed
    // someone else booked this seat between our read and write
    if (updateResult.rowCount === 0) {
      throw new ApiError(
        409,
        "Seat was just booked by someone else — please retry"
      )
    }

    // Step 6 — create booking record
    const bookingResult = await client.query(
      `INSERT INTO bookings (user_id, seat_id, status, amount_paise)
       VALUES ($1, $2, 'confirmed', $3)
       RETURNING *`,
      [user_id, seat_id, seat.price_paise]
    )

    // Step 7 — commit
    await client.query("COMMIT")

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          booking: bookingResult.rows[0],
          seat: {
            id: seat.id,
            label: seat.label,
            category: seat.category,
          },
        },
        "Seat booked successfully using optimistic locking 🔓"
      )
    )
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────
// GET MY BOOKINGS
// ─────────────────────────────────────────────────────────────

const getMyBookings = asyncHandler(async (req, res) => {
  // 1. Get logged in user id from req.user
  // 2. Fetch all their bookings with seat and event details
  // 3. Return list

  const user_id = req.user.id

  const result = await pool.query(
    `SELECT 
       b.id AS booking_id,
       b.status AS booking_status,
       b.amount_paise,
       b.created_at AS booked_at,
       s.label AS seat_label,
       s.category AS seat_category,
       e.name AS event_name,
       e.venue AS event_venue,
       e.starts_at AS event_starts_at
     FROM bookings b
     JOIN seats s ON b.seat_id = s.id
     JOIN events e ON s.event_id = e.id
     WHERE b.user_id = $1
     ORDER BY b.created_at DESC`,
    [user_id]
  )

  return res.status(200).json(
    new ApiResponse(200, result.rows, "Bookings fetched successfully")
  )
})

export { bookSeatPessimistic, bookSeatOptimistic, getMyBookings }