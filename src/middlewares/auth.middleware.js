import jwt from "jsonwebtoken"
import { pool } from "../config/db.js"
import ApiError from "../utilis/ApiError.js"
import asyncHandler from "../utilis/asyncHandler.js"

// verifyJWT checks if the user has a valid token
// if yes → attach user to req.user and move forward
// if no → throw 401 error

export const verifyJWT = asyncHandler(async (req, res, next) => {
  // 1. Get token from Authorization header
  // header looks like: "Bearer eyJhbGci..."
  const token =
    req.header("Authorization")?.replace("Bearer ", "")

  // 2. If no token → unauthorized
  if (!token) {
    throw new ApiError(401, "Unauthorized request — no token provided")
  }

  // 3. Verify the token with our secret
  const decodedToken = jwt.verify(token, process.env.JWT_SECRET)

  // 4. Find user in database using id from token
  const result = await pool.query(
    "SELECT id, name, email, created_at FROM users WHERE id = $1",
    [decodedToken.id]
  )

  const user = result.rows[0]

  // 5. If user not found in DB
  if (!user) {
    throw new ApiError(401, "Invalid access token — user not found")
  }

  // 6. Attach user to request so controllers can use it
  req.user = user

  // 7. Move to the next middleware or controller
  next()
})