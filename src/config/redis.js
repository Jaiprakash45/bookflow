import Redis from "ioredis"
import dotenv from "dotenv"

dotenv.config()

// Create Redis connection
// ioredis automatically reconnects if connection drops
const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,

  // retry connection if it fails
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000)
    return delay
  },
})

redis.on("connect", () => {
  console.log("Redis connected ✅")
})

redis.on("error", (error) => {
  console.error("Redis error ❌", error.message)
})

export default redis