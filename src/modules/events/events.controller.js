import { pool } from "../../config/db.js"
import asyncHandler from "../../utilis/asyncHandler.js"
import ApiError from "../../utilis/ApiError.js"
import ApiResponse from "../../utilis/ApiResponse.js"

// ─────────────────────────────────────────
// GET ALL EVENTS
// ─────────────────────────────────────────

const getAllEvents = asyncHandler(async (req, res) => {
  // 1. Query all events from database
  // 2. Return them ordered by date

  const result = await pool.query(
    "SELECT * FROM events ORDER BY starts_at ASC"
  )

  return res
    .status(200)
    .json(new ApiResponse(200, result.rows, "Events fetched successfully"))
})

// ─────────────────────────────────────────
// GET ONE EVENT WITH ALL ITS SEATS
// ─────────────────────────────────────────

const getEventWithSeats = asyncHandler(async (req, res) => {
  // 1. Get event id from URL params
  // 2. Find the event
  // 3. Find all seats for that event
  // 4. Return event + seats together

  const { id } = req.params

  // Step 1 — find the event
  const eventResult = await pool.query(
    "SELECT * FROM events WHERE id = $1",
    [id]
  )

  // Step 2 — if event not found
  if (eventResult.rows.length === 0) {
    throw new ApiError(404, "Event not found")
  }

  const event = eventResult.rows[0]

  // Step 3 — find all seats for this event
  const seatsResult = await pool.query(
    "SELECT * FROM seats WHERE event_id = $1 ORDER BY label ASC",
    [id]
  )

  // Step 4 — return both together
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { event, seats: seatsResult.rows },
        "Event fetched successfully"
      )
    )
})

// ─────────────────────────────────────────
// CREATE EVENT WITH SEATS
// ─────────────────────────────────────────

const createEvent = asyncHandler(async (req, res) => {
  // 1. Get event details and seats array from body
  // 2. Validate required fields
  // 3. Start a database transaction
  // 4. Insert the event
  // 5. Insert all seats linked to that event
  // 6. Commit the transaction
  // 7. If anything fails → rollback (undo everything)

  const { name, description, venue, starts_at, seats } = req.body

  // Step 1 — validate
  if (!name || !venue || !starts_at) {
    throw new ApiError(400, "Name, venue and starts_at are required")
  }

  if (!seats || seats.length === 0) {
    throw new ApiError(400, "At least one seat is required")
  }

  // Step 2 — get a client from pool for transaction
  // we need same client for BEGIN → INSERT → COMMIT to work together
  const client = await pool.connect()

  try {
    // Step 3 — start transaction
    await client.query("BEGIN")

    // Step 4 — insert the event
    const eventResult = await client.query(
      `INSERT INTO events (name, description, venue, starts_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, description, venue, starts_at]
    )

    const event = eventResult.rows[0]

    // Step 5 — insert all seats linked to this event
    for (const seat of seats) {
      if (!seat.label || !seat.category || !seat.price_paise) {
        throw new ApiError(400, "Each seat needs label, category and price_paise")
      }

      await client.query(
        `INSERT INTO seats (event_id, label, category, price_paise)
         VALUES ($1, $2, $3, $4)`,
        [event.id, seat.label, seat.category, seat.price_paise]
      )
    }

    // Step 6 — commit → save everything to database
    await client.query("COMMIT")

    return res
      .status(201)
      .json(new ApiResponse(201, event, "Event created successfully"))

  } catch (error) {
    // Step 7 — if anything went wrong → rollback
    // this undoes the event insert AND all seat inserts
    // database goes back to how it was before
    await client.query("ROLLBACK")
    throw error

  } finally {
    // always release client back to pool
    // whether success or error
    client.release()
  }
})

export { getAllEvents, getEventWithSeats, createEvent }