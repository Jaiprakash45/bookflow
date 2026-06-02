import pg from "pg"
import dotenv from "dotenv"

dotenv.config()

const { Pool } = pg

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

const connectDB = async () => {
  try {
    const client = await pool.connect()

    console.log("PostgreSQL connected ✅")

    client.release()
  } catch (error) {
    console.error(
      "PostgreSQL connection failed ❌",
      error.message
    )
    process.exit(1)
  }
}

export { pool, connectDB }