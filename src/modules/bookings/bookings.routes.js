import { Router } from "express"
import {
  bookSeatPessimistic,
  bookSeatOptimistic,
  getMyBookings,
} from "./bookings.controller.js"
import {
  reserveSeat,
  confirmReservation,
  cancelReservation,
  getReservationStatus,
} from "./reservation.controller.js"
import { verifyJWT } from "../../middlewares/auth.middleware.js"

const router = Router()

// all booking routes require login
// verifyJWT runs before every controller here
router.use(verifyJWT)

// two booking strategies — same result, different approach
router.route("/pessimistic").post(bookSeatPessimistic)
router.route("/optimistic").post(bookSeatOptimistic)


// Phase 3 routes — reserve → confirm flow
router.route("/reserve").post(reserveSeat)
router.route("/confirm").post(confirmReservation)
router.route("/cancel-reservation").post(cancelReservation)
router.route("/reservation-status/:seat_id").get(getReservationStatus)

// get logged in user's bookings
router.route("/my-bookings").get(getMyBookings)

export default router