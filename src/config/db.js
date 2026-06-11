import pg from "pg"
import dotenv from "dotenv"

dotenv.config()

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const connectDB = async () => {
  try {
    const client = await pool.connect()

    console.log("PostgreSQL connected ✅")

    client.release()
  } catch (err) {
  console.log("PostgreSQL connection failed ❌")
  console.error(err)
  process.exit(1)
}
}

export { pool, connectDB }