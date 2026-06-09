import { pool } from "../config/db.js"
import redis from "../config/redis.js"

// ─────────────────────────────────────────────────────
// RESERVATION CLEANUP WORKER
// Runs every 60 seconds
// Finds all pending bookings that have expired
// Releases the seat back to available
// Updates booking status to cancelled
// ─────────────────────────────────────────────────────

const cleanupExpiredReservations = async () => {
  // get a client for transaction
  const client = await pool.connect()

  try {
    console.log("🔄 Running reservation cleanup...")

    await client.query("BEGIN")

    // Step 1 — find all expired pending bookings
    // expires_at < NOW() means the 10 minutes is up
    // status = pending means user never paid
    const expiredResult = await client.query(
      `SELECT b.id AS booking_id,
              b.seat_id,
              b.user_id
       FROM bookings b
       WHERE b.status = 'pending'
       AND b.expires_at < NOW()`
    )

    const expiredBookings = expiredResult.rows

    if (expiredBookings.length === 0) {
      console.log("✅ No expired reservations found")
      await client.query("ROLLBACK")
      return
    }

    console.log(`Found ${expiredBookings.length} expired reservation(s)`)

    // Step 2 — process each expired booking
    for (const booking of expiredBookings) {
      // release seat back to available
      await client.query(
        `UPDATE seats
         SET status = 'available',
             reserved_by = NULL
         WHERE id = $1`,
        [booking.seat_id]
      )

      // mark booking as cancelled
      await client.query(
        `UPDATE bookings
         SET status = 'cancelled'
         WHERE id = $1`,
        [booking.booking_id]
      )

      // delete Redis key if it still exists
      // it may already be expired — that is fine
      // del on non-existent key does nothing
      await redis.del(`reservation:${booking.seat_id}`)

      console.log(`Released seat ${booking.seat_id} from expired reservation`)
    }

    await client.query("COMMIT")

    console.log(`✅ Cleanup done — released ${expiredBookings.length} seat(s)`)

  } catch (error) {
    await client.query("ROLLBACK")
    console.error("❌ Cleanup worker error:", error.message)
  } finally {
    client.release()
  }
}

// Start the worker — runs every 60 seconds
const startCleanupWorker = () => {
  console.log("🚀 Reservation cleanup worker started")

  // run immediately on startup
  cleanupExpiredReservations()

  // then run every 60 seconds
  setInterval(cleanupExpiredReservations, 60 * 1000)
}

export { startCleanupWorker, cleanupExpiredReservations }