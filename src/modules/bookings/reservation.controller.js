import { pool } from "../../config/db.js"
import redis from "../../config/redis.js"
import asyncHandler from "../../utilis/asyncHandler.js"
import ApiError from "../../utilis/ApiError.js"
import ApiResponse from "../../utilis/ApiResponse.js"

import { calculateLockedPrice } from "../../services/pricing.service.js"

import { publishMessage } from "../../config/rabbitmq.js"

const RESERVATION_TTL = parseInt(process.env.RESERVATION_TTL) || 600

// ─────────────────────────────────────────────────────
// RESERVE SEAT
// Holds a seat for 10 minutes
// Uses Redis distributed lock to prevent race condition
// ─────────────────────────────────────────────────────

const reserveSeat = asyncHandler(async (req, res) => {
  // 1. Get seat id from body
  // 2. Try to acquire distributed lock on this seat
  //    — prevents two users from passing the check simultaneously
  // 3. Check if seat is available in PostgreSQL
  // 4. Set reservation key in Redis with 10 min TTL
  // 5. Update seat status to reserved in PostgreSQL
  // 6. Create a pending booking with expires_at
  // 7. Release the lock
  // 8. Return reservation details with expiry time

  const { seat_id } = req.body
  const user_id = req.user.id

  if (!seat_id) {
    throw new ApiError(400, "seat_id is required")
  }

  // Step 2 — acquire distributed lock
  // lock key is different from reservation key
  // lock is held for 5 seconds — just long enough for our operation
  // NX means only set if not exists — atomic operation
  const lockKey = `lock:seat:${seat_id}`
  const lockValue = `${user_id}:${Date.now()}`

  const lockAcquired = await redis.set(
    lockKey,
    lockValue,
    "NX",
    "EX",
    5  // 5 second lock — operation must complete in this time
  )

  // if lockAcquired is null — another request holds the lock
  // seat is being processed right now — ask user to try again
  if (!lockAcquired) {
    throw new ApiError(
      409,
      "Seat is being processed by another request — please try again"
    )
  }

  // we now hold the lock — do our work inside try/finally
  // finally ensures lock is ALWAYS released
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Step 3 — check seat availability in PostgreSQL
    const seatResult = await client.query(
      `SELECT * FROM seats WHERE id = $1`,
      [seat_id]
    )

    if (seatResult.rows.length === 0) {
      throw new ApiError(404, "Seat not found")
    }

    const seat = seatResult.rows[0]

    if (seat.status !== "available") {
      throw new ApiError(
        409,
        `Seat is already ${seat.status} — try another seat`
      )
    }

    // Step 4 — set reservation in Redis
    // reservation key is separate from lock key
    // this persists for 10 minutes — tracks who holds the seat
    const reservationKey = `reservation:${seat_id}`

    const reservationSet = await redis.set(
      reservationKey,
      user_id,
      "NX",    // only set if no existing reservation
      "EX",
      RESERVATION_TTL
    )

    // if null — someone else already has a Redis reservation
    // even though seat shows available in DB
    // this can happen if cleanup worker hasn't run yet
    if (!reservationSet) {
      throw new ApiError(
        409,
        "Seat is already reserved — try another seat"
      )
    }

    // Step 5 — update seat status to reserved in PostgreSQL
    await client.query(
      `UPDATE seats
       SET status = 'reserved',
           reserved_by = $1
       WHERE id = $2`,
      [user_id, seat_id]
    )
const lockedPrice = await calculateLockedPrice(seat_id);
    // Step 6 — create pending booking with expiry time
    // expires_at is 10 minutes from now
    // cleanup worker will cancel this if not confirmed in time
    const bookingResult = await client.query(
      `INSERT INTO bookings 
         (user_id, seat_id, status, amount_paise, expires_at)
       VALUES 
         ($1, $2, 'pending', $3, NOW() + INTERVAL '${RESERVATION_TTL} seconds')
       RETURNING *`,
     [user_id, seat_id, lockedPrice]
    )

    await client.query("COMMIT")

    const booking = bookingResult.rows[0]

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          booking_id: booking.id,
          seat: {
            id: seat.id,
            label: seat.label,
            category: seat.category,
          },
          amount_paise: lockedPrice,
          expires_at: booking.expires_at,
          ttl_seconds: RESERVATION_TTL,
          message: `Seat held for ${RESERVATION_TTL / 60} minutes — complete payment before it expires`,
        },
        "Seat reserved successfully ⏳"
      )
    )

  } catch (error) {
    await client.query("ROLLBACK")

    // if DB failed after Redis key was set — clean up Redis key
    // otherwise seat will be stuck reserved in Redis
    // but available in DB — inconsistent state
    await redis.del(`reservation:${seat_id}`)

    throw error

  } finally {
    client.release()

    // ALWAYS release the lock — whether success or failure
    // only release OUR lock — not someone else's
    // check value before deleting — prevents releasing wrong lock
    const currentLockValue = await redis.get(lockKey)
    if (currentLockValue === lockValue) {
      await redis.del(lockKey)
    }
  }
})

// ─────────────────────────────────────────────────────
// CONFIRM RESERVATION
// Called after user completes payment
// Converts pending booking to confirmed
// ─────────────────────────────────────────────────────

const confirmReservation = asyncHandler(async (req, res) => {
  // 1. Get booking id from body
  // 2. Find the booking — must be pending and not expired
  // 3. Verify Redis reservation key still exists
  //    — if expired → booking is already cancelled by worker
  // 4. Update booking to confirmed
  // 5. Update seat to booked
  // 6. Delete Redis reservation key
  // 7. Return confirmed booking

  const { booking_id } = req.body
  const user_id = req.user.id

  if (!booking_id) {
    throw new ApiError(400, "booking_id is required")
  }

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Step 2 — find the booking
    const bookingResult = await client.query(
      `SELECT b.*, s.label, s.category, s.price_paise
       FROM bookings b
       JOIN seats s ON b.seat_id = s.id
       WHERE b.id = $1
       AND b.user_id = $2`,
      [booking_id, user_id]
    )

    if (bookingResult.rows.length === 0) {
      throw new ApiError(404, "Booking not found")
    }

    const booking = bookingResult.rows[0]

    // check booking is still pending
    if (booking.status !== "pending") {
      throw new ApiError(
        409,
        `Booking is already ${booking.status} — cannot confirm`
      )
    }

    // check booking has not expired in PostgreSQL
    if (new Date(booking.expires_at) < new Date()) {
      throw new ApiError(
        410,
        "Reservation has expired — please reserve the seat again"
      )
    }

    // Step 3 — verify Redis key still exists
    // Redis key expiring means reservation window passed
    const reservationKey = `reservation:${booking.seat_id}`
    const redisValue = await redis.get(reservationKey)

    if (!redisValue) {
      throw new ApiError(
        410,
        "Reservation has expired — please reserve the seat again"
      )
    }

    // verify the Redis key belongs to this user
    if (redisValue !== user_id) {
      throw new ApiError(403, "This reservation belongs to another user")
    }

    // Step 4 — confirm booking
    await client.query(
      `UPDATE bookings
       SET status = 'confirmed',
           expires_at = NULL
       WHERE id = $1`,
      [booking_id]
    )

    // Step 5 — mark seat as permanently booked
    await client.query(
      `UPDATE seats
       SET status = 'booked',
           reserved_by = NULL
       WHERE id = $1`,
      [booking.seat_id]
    )

    await client.query("COMMIT")

    // publish booking confirmed event
// notification worker picks this up and sends email
// we don't await this — fire and forget
// booking success should never depend on notification success
publishMessage("booking.confirmed", {
  booking_id: booking.id,
  user_id: user_id,
  seat_label: booking.label,
  category: booking.category,
  amount_paise: booking.price_paise,
  event_name: booking.event_name || "BookFlow Event",
})

    // Step 6 — delete Redis reservation key
    // seat is now permanently booked — no need for TTL key
    await redis.del(reservationKey)

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          booking_id: booking.id,
          status: "confirmed",
          seat: {
            label: booking.label,
            category: booking.category,
          },
          amount_paise: booking.price_paise,
        },
        "Booking confirmed successfully ✅"
      )
    )

  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────
// CANCEL RESERVATION
// User manually cancels before 10 minutes is up
// ─────────────────────────────────────────────────────

const cancelReservation = asyncHandler(async (req, res) => {
  // 1. Get booking id from body
  // 2. Find the booking — must belong to this user
  // 3. Must be pending — cannot cancel already confirmed booking
  // 4. Release seat back to available
  // 5. Cancel booking in PostgreSQL
  // 6. Delete Redis key
  // 7. Return success

  const { booking_id } = req.body
  const user_id = req.user.id

  if (!booking_id) {
    throw new ApiError(400, "booking_id is required")
  }

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Step 2 — find booking
    const bookingResult = await client.query(
      `SELECT * FROM bookings
       WHERE id = $1
       AND user_id = $2`,
      [booking_id, user_id]
    )

    if (bookingResult.rows.length === 0) {
      throw new ApiError(404, "Booking not found")
    }

    const booking = bookingResult.rows[0]

    // Step 3 — only pending bookings can be cancelled this way
    if (booking.status !== "pending") {
      throw new ApiError(
        409,
        `Cannot cancel a ${booking.status} booking this way`
      )
    }

    // Step 4 — release seat
    await client.query(
      `UPDATE seats
       SET status = 'available',
           reserved_by = NULL
       WHERE id = $1`,
      [booking.seat_id]
    )

    // Step 5 — cancel booking
    await client.query(
      `UPDATE bookings
       SET status = 'cancelled'
       WHERE id = $1`,
      [booking_id]
    )

    await client.query("COMMIT")

    // publish cancellation event
publishMessage("booking.cancelled", {
  booking_id: booking_id,
  user_id: user_id,
  seat_label: booking.seat_id,
})

    // Step 6 — delete Redis key
    await redis.del(`reservation:${booking.seat_id}`)

    return res.status(200).json(
      new ApiResponse(200, { booking_id }, "Reservation cancelled successfully")
    )

  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────
// CHECK RESERVATION STATUS
// How much time is left for a reservation
// ─────────────────────────────────────────────────────

const getReservationStatus = asyncHandler(async (req, res) => {
  const { seat_id } = req.params

  // check Redis for reservation
  const reservationKey = `reservation:${seat_id}`
  const redisValue = await redis.get(reservationKey)
  const ttl = await redis.ttl(reservationKey)

  // check DB for seat status
  const seatResult = await pool.query(
    `SELECT id, label, category, status FROM seats WHERE id = $1`,
    [seat_id]
  )

  if (seatResult.rows.length === 0) {
    throw new ApiError(404, "Seat not found")
  }

  const seat = seatResult.rows[0]

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        seat_id,
        seat_label: seat.label,
        db_status: seat.status,
        redis_reserved: redisValue !== null,
        reserved_by: redisValue || null,
        ttl_seconds_remaining: ttl > 0 ? ttl : 0,
      },
      "Reservation status fetched"
    )
  )
})

export {
  reserveSeat,
  confirmReservation,
  cancelReservation,
  getReservationStatus,
}