import express from "express"
import dotenv from "dotenv"

dotenv.config()

const app = express()

// Middleware
app.use(express.json({ limit: "16kb" }))
app.use(express.urlencoded({ extended: true, limit: "16kb" }))

// Routes
import authRoutes from "./modules/auth/auth.routes.js"
import eventRoutes from "./modules/events/events.routes.js"
import bookingRoutes from "./modules/bookings/bookings.routes.js"
app.use("/api/v1/auth", authRoutes)
app.use("/api/v1/events", eventRoutes)
app.use("/api/v1/bookings", bookingRoutes)
// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "BookFlow server is running 🚀" })
})

export { app }