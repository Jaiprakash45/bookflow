import { Router } from "express"
import { registerUser, loginUser, getCurrentUser } from "./auth.controller.js"
import { verifyJWT } from "../../middlewares/auth.middleware.js"

const router = Router()

// public routes — no token needed
router.route("/register").post(registerUser)
router.route("/login").post(loginUser)

// protected route — token required
// verifyJWT runs first, then getCurrentUser
router.route("/me").get(verifyJWT, getCurrentUser)

export default router