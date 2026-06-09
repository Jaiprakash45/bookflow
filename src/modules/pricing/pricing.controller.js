import asyncHandler from "../../utilis/asyncHandler.js"
import ApiError from "../../utilis/ApiError.js"
import ApiResponse from "../../utilis/ApiResponse.js"
import {
  calculateSeatPrice,
  calculateEventPrices,
} from "../../services/pricing.service.js"

// ─────────────────────────────────────────────────────
// GET PRICE FOR ONE SEAT
// Shows full price breakdown with all multipliers
// ─────────────────────────────────────────────────────

const getSeatPrice = asyncHandler(async (req, res) => {
  // 1. Get seat id from params
  // 2. Calculate price using pricing service
  // 3. Return price with full breakdown

  const { seat_id } = req.params

  if (!seat_id) {
    throw new ApiError(400, "seat_id is required")
  }

  try {
    const priceData = await calculateSeatPrice(seat_id)

    return res.status(200).json(
      new ApiResponse(
        200,
        priceData,
        priceData.from_cache
          ? "Price fetched from cache ⚡"
          : "Price calculated fresh 🔄"
      )
    )
  } catch (error) {
    if (error.message === "Seat not found") {
      throw new ApiError(404, "Seat not found")
    }
    throw error
  }
})

// ─────────────────────────────────────────────────────
// GET PRICES FOR ALL SEATS IN AN EVENT
// Used for event page seat selection
// ─────────────────────────────────────────────────────

const getEventPrices = asyncHandler(async (req, res) => {
  // 1. Get event id from params
  // 2. Calculate prices for all seats
  // 3. Group by category for easy frontend use
  // 4. Return all prices

  const { event_id } = req.params

  if (!event_id) {
    throw new ApiError(400, "event_id is required")
  }

  try {
    const prices = await calculateEventPrices(event_id)

    // group seats by category for better response structure
    const grouped = prices.reduce((acc, seat) => {
      if (!acc[seat.category]) {
        acc[seat.category] = []
      }
      acc[seat.category].push(seat)
      return acc
    }, {})

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          event_id,
          total_seats: prices.length,
          seats_by_category: grouped,
          all_seats: prices,
        },
        "Event prices fetched successfully"
      )
    )
  } catch (error) {
    if (error.message === "No seats found for this event") {
      throw new ApiError(404, "No seats found for this event")
    }
    throw error
  }
})

export { getSeatPrice, getEventPrices }