import { Router } from "express"
import { getSeatPrice, getEventPrices } from "./pricing.controller.js"
import { verifyJWT } from "../../middlewares/auth.middleware.js"

const router = Router()

// public routes — anyone can check prices
router.route("/seat/:seat_id").get(getSeatPrice)
router.route("/event/:event_id").get(getEventPrices)

export default router