import { pool } from "../config/db.js"
import redis from "../config/redis.js"

// ─────────────────────────────────────────────────────
// PRICING SERVICE
// Calculates dynamic price for a seat
// Uses three factors:
//   1. Occupancy — how many seats are sold
//   2. Time      — how close to event start
//   3. Category  — VIP costs more than General
// ─────────────────────────────────────────────────────

// cache key format for Redis
// prices cached per seat per event — 60 second TTL
const getPriceCacheKey = (seat_id) => `price:seat:${seat_id}`

// ─────────────────────────────────────────────────────
// CALCULATE OCCUPANCY PERCENTAGE
// How many percent of seats in this event are booked
// ─────────────────────────────────────────────────────

const getOccupancyPercentage = async (event_id) => {
  const result = await pool.query(
    `SELECT
       COUNT(*) AS total_seats,
       COUNT(*) FILTER (WHERE status = 'booked') AS booked_seats
     FROM seats
     WHERE event_id = $1`,
    [event_id]
  )

  const { total_seats, booked_seats } = result.rows[0]

  // avoid division by zero
  if (parseInt(total_seats) === 0) return 0

  return (parseInt(booked_seats) / parseInt(total_seats)) * 100
}

// ─────────────────────────────────────────────────────
// GET OCCUPANCY MULTIPLIER
// Queries pricing_rules table based on occupancy %
// ─────────────────────────────────────────────────────

const getOccupancyMultiplier = async (occupancyPercent) => {
  const result = await pool.query(
    `SELECT multiplier, rule_name
     FROM pricing_rules
     WHERE $1 >= occupancy_min
     AND $1 < occupancy_max
     LIMIT 1`,
    [occupancyPercent]
  )

  // default to 1.0 if no rule found
  if (result.rows.length === 0) return { multiplier: 1.0, rule_name: "default" }

  return result.rows[0]
}

// ─────────────────────────────────────────────────────
// GET TIME MULTIPLIER
// Price changes based on hours until event starts
// ─────────────────────────────────────────────────────

const getTimeMultiplier = async (starts_at) => {
  // calculate hours between now and event start
  const now = new Date()
  const eventTime = new Date(starts_at)
  const hoursUntilEvent = (eventTime - now) / (1000 * 60 * 60)

  // event already started — use last minute deal price
  if (hoursUntilEvent < 0) {
    return { multiplier: 0.70, rule_name: "event started" }
  }

  const result = await pool.query(
    `SELECT multiplier, rule_name
     FROM time_pricing_rules
     WHERE $1 >= hours_before_min
     AND $1 < hours_before_max
     LIMIT 1`,
    [Math.floor(hoursUntilEvent)]
  )

  if (result.rows.length === 0) return { multiplier: 1.0, rule_name: "default" }

  return result.rows[0]
}

// ─────────────────────────────────────────────────────
// GET CATEGORY MULTIPLIER
// VIP seats have higher base multiplier
// ─────────────────────────────────────────────────────

const getCategoryMultiplier = async (category) => {
  const result = await pool.query(
    `SELECT multiplier
     FROM category_multipliers
     WHERE category = $1`,
    [category]
  )

  // default 1.0 if category not found
  if (result.rows.length === 0) return 1.0

  return parseFloat(result.rows[0].multiplier)
}

// ─────────────────────────────────────────────────────
// MAIN FUNCTION — CALCULATE PRICE FOR A SEAT
// This is what controllers call
// Returns calculated price with breakdown
// ─────────────────────────────────────────────────────

const calculateSeatPrice = async (seat_id) => {
  // Step 1 — check Redis cache first
  // if price was calculated in last 60 seconds → return cached
  const cacheKey = getPriceCacheKey(seat_id)
  const cached = await redis.get(cacheKey)

  if (cached) {
    const parsed = JSON.parse(cached)
    return { ...parsed, from_cache: true }
  }

  // Step 2 — cache miss → calculate from database
  // get seat details and event details in one query
  const seatResult = await pool.query(
    `SELECT 
       s.id,
       s.label,
       s.category,
       s.status,
       s.price_paise AS base_price_paise,
       e.id AS event_id,
       e.name AS event_name,
       e.starts_at
     FROM seats s
     JOIN events e ON s.event_id = e.id
     WHERE s.id = $1`,
    [seat_id]
  )

  if (seatResult.rows.length === 0) {
    throw new Error("Seat not found")
  }

  const seat = seatResult.rows[0]

  // Step 3 — get all three multipliers
  const occupancyPercent = await getOccupancyPercentage(seat.event_id)
  const occupancyRule = await getOccupancyMultiplier(occupancyPercent)
  const timeRule = await getTimeMultiplier(seat.starts_at)
  const categoryMultiplier = await getCategoryMultiplier(seat.category)

  // Step 4 — calculate final price
  // final price = base × occupancy × time × category
  const occupancyMultiplier = parseFloat(occupancyRule.multiplier)
  const timeMultiplier = parseFloat(timeRule.multiplier)

  const finalPrice = Math.round(
    seat.base_price_paise *
    occupancyMultiplier *
    timeMultiplier *
    categoryMultiplier
  )

  // Step 5 — build price breakdown object
  const priceData = {
    seat_id: seat.id,
    seat_label: seat.label,
    category: seat.category,
    status: seat.status,
    event_name: seat.event_name,

    // price breakdown — show user exactly why price is what it is
    base_price_paise: seat.base_price_paise,
    occupancy_percent: Math.round(occupancyPercent),
    occupancy_rule: occupancyRule.rule_name,
    occupancy_multiplier: occupancyMultiplier,
    time_rule: timeRule.rule_name,
    time_multiplier: timeMultiplier,
    category_multiplier: categoryMultiplier,

    // final calculated price
    final_price_paise: finalPrice,
    final_price_rupees: (finalPrice / 100).toFixed(2),

    calculated_at: new Date().toISOString(),
    from_cache: false,
  }

  // Step 6 — store in Redis with 60 second TTL
  // 60 seconds is acceptable staleness for price display
  // we NEVER use cached price for actual payment — always recalculate
  await redis.set(
    cacheKey,
    JSON.stringify(priceData),
    "EX",
    60
  )

  return priceData
}

// ─────────────────────────────────────────────────────
// CALCULATE PRICE FOR ALL SEATS IN AN EVENT
// Used for event page — show all seat prices at once
// ─────────────────────────────────────────────────────

const calculateEventPrices = async (event_id) => {
  // get all seats for this event
  const seatsResult = await pool.query(
    `SELECT s.id
     FROM seats s
     WHERE s.event_id = $1
     ORDER BY s.label ASC`,
    [event_id]
  )

  if (seatsResult.rows.length === 0) {
    throw new Error("No seats found for this event")
  }

  // calculate price for each seat
  // Promise.all runs all calculations in parallel — much faster
  const prices = await Promise.all(
    seatsResult.rows.map((seat) => calculateSeatPrice(seat.id))
  )

  return prices
}

// ─────────────────────────────────────────────────────
// CALCULATE LOCKED PRICE FOR RESERVATION
// Called at reservation time — not display time
// This price is what user actually pays
// Never served from cache — always fresh calculation
// ─────────────────────────────────────────────────────

const calculateLockedPrice = async (seat_id) => {
  // delete cache first — force fresh calculation
  // we never want a stale price locked into a booking
  const cacheKey = getPriceCacheKey(seat_id)
  await redis.del(cacheKey)

  // calculate fresh price
  const priceData = await calculateSeatPrice(seat_id)

  return priceData.final_price_paise
}

export {
  calculateSeatPrice,
  calculateEventPrices,
  calculateLockedPrice,
}