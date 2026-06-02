import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { pool } from "../../config/db.js"
import asyncHandler from "../../utilis/asyncHandler.js"
import ApiError from "../../utilis/ApiError.js"
import ApiResponse from "../../utilis/ApiResponse.js"

// ─────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────

const registerUser = asyncHandler(async (req, res) => {
  // 1. Get data from request body
  // 2. Validate — all fields must be present
  // 3. Check if user already exists
  // 4. Hash the password
  // 5. Save user to database
  // 6. Return response without password

  const { name, email, password } = req.body

  // Step 1 — validate fields
  if (!name || !email || !password) {
    throw new ApiError(400, "Name, email and password are required")
  }

  // Step 2 — check if email already registered
  const existingUser = await pool.query(
    "SELECT id FROM users WHERE email = $1",
    [email]
  )

  if (existingUser.rows.length > 0) {
    throw new ApiError(409, "Email is already registered")
  }

  // Step 3 — hash the password before saving
  // never save plain text password in database
  const hashedPassword = await bcrypt.hash(password, 10)

  // Step 4 — save user to database
  const result = await pool.query(
    `INSERT INTO users (name, email, password) 
     VALUES ($1, $2, $3) 
     RETURNING id, name, email, created_at`,
    [name, email, hashedPassword]
  )

  const createdUser = result.rows[0]

  // Step 5 — send response
  // RETURNING in SQL automatically excludes password since we didn't select it
  return res
    .status(201)
    .json(new ApiResponse(201, createdUser, "User registered successfully"))
})

// ─────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────

const loginUser = asyncHandler(async (req, res) => {
  // 1. Get email and password from body
  // 2. Find user by email
  // 3. Compare password with hashed password in DB
  // 4. Generate JWT token
  // 5. Send token and user in response

  const { email, password } = req.body

  // Step 1 — validate
  if (!email || !password) {
    throw new ApiError(400, "Email and password are required")
  }

  // Step 2 — find user in database
  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  )

  const user = result.rows[0]

  if (!user) {
    throw new ApiError(401, "Invalid email or password")
  }

  // Step 3 — compare entered password with hashed password in DB
  const isPasswordCorrect = await bcrypt.compare(password, user.password)

  if (!isPasswordCorrect) {
    throw new ApiError(401, "Invalid email or password")
  }

  // Step 4 — generate JWT token
  // token contains user id and email — this is the payload
  const accessToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRY,
    }
  )

  // Step 5 — send response
  // never send password back to frontend
  const loggedInUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    created_at: user.created_at,
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken },
        "User logged in successfully"
      )
    )
})

// ─────────────────────────────────────────
// GET CURRENT USER
// ─────────────────────────────────────────

const getCurrentUser = asyncHandler(async (req, res) => {
  // req.user is already attached by verifyJWT middleware
  // no need to query DB again

  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"))
})

export { registerUser, loginUser, getCurrentUser }