import { Router } from "express"
import { getAllEvents, getEventWithSeats, createEvent } from "./events.controller.js"
import { verifyJWT } from "../../middlewares/auth.middleware.js"

const router = Router()

// public routes — anyone can see events
router.route("/").get(getAllEvents)
router.route("/:id").get(getEventWithSeats)

// protected route — only logged in users can create events
router.route("/").post(verifyJWT, createEvent)

export default router