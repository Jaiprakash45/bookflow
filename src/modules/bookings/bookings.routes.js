import { Router } from "express"
import {
  bookSeatPessimistic,
  bookSeatOptimistic,
  getMyBookings,
} from "./bookings.controller.js"
import { verifyJWT } from "../../middlewares/auth.middleware.js"

const router = Router()

// all booking routes require login
// verifyJWT runs before every controller here
router.use(verifyJWT)

// two booking strategies — same result, different approach
router.route("/pessimistic").post(bookSeatPessimistic)
router.route("/optimistic").post(bookSeatOptimistic)

// get logged in user's bookings
router.route("/my-bookings").get(getMyBookings)

export default router