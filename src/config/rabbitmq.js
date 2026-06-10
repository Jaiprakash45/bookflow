import amqplib from "amqplib"
import dotenv from "dotenv"

dotenv.config()

// ─────────────────────────────────────────────────────
// RabbitMQ connection and channel
// We keep one connection and one channel alive
// reusing them for all publish operations
// ─────────────────────────────────────────────────────

let connection = null
let channel = null

// exchange name — all booking events go through this
const EXCHANGE_NAME = "bookflow.events"
const EXCHANGE_TYPE = "direct"

const connectRabbitMQ = async () => {
  try {
    // Step 1 — create connection
    // connection is like a TCP socket to RabbitMQ server
    connection = await amqplib.connect(
      process.env.RABBITMQ_URL || "amqp://localhost:5672"
    )

    // Step 2 — create channel
    // channel is a virtual connection inside the real connection
    // you can have multiple channels per connection
    // each channel is independent
    channel = await connection.createChannel()

    // Step 3 — assert exchange
    // assertExchange creates it if not exists
    // durable: true → exchange survives RabbitMQ restart
    await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, {
      durable: true,
    })

    // Step 4 — assert queues
    // durable: true → queue and messages survive restart
    await channel.assertQueue("booking.confirmed", { durable: true })
    await channel.assertQueue("booking.cancelled", { durable: true })
    await channel.assertQueue("reservation.expired", { durable: true })

    // Step 5 — bind queues to exchange
    // binding key matches the routing key used when publishing
    await channel.bindQueue("booking.confirmed", EXCHANGE_NAME, "booking.confirmed")
    await channel.bindQueue("booking.cancelled", EXCHANGE_NAME, "booking.cancelled")
    await channel.bindQueue("reservation.expired", EXCHANGE_NAME, "reservation.expired")

    console.log("RabbitMQ connected ✅")

    // handle connection errors
    connection.on("error", (error) => {
      console.error("RabbitMQ connection error ❌", error.message)
    })

    connection.on("close", () => {
      console.log("RabbitMQ connection closed")
    })

  } catch (error) {
    console.error("RabbitMQ connection failed ❌", error.message)
    process.exit(1)
  }
}

// ─────────────────────────────────────────────────────
// PUBLISH MESSAGE
// Called by booking API to send events
// routingKey → which queue to send to
// data       → the message payload
// ─────────────────────────────────────────────────────

const publishMessage = async (routingKey, data) => {
  try {
    if (!channel) {
      throw new Error("RabbitMQ channel not initialized")
    }

    // convert data object to Buffer — RabbitMQ sends bytes
    const message = Buffer.from(JSON.stringify(data))

    // publish to exchange with routing key
    // persistent: true → message survives RabbitMQ restart
    channel.publish(EXCHANGE_NAME, routingKey, message, {
      persistent: true,
      contentType: "application/json",
      timestamp: Date.now(),
    })

    console.log(`📤 Published: ${routingKey}`, data)

  } catch (error) {
    console.error(`Failed to publish ${routingKey}:`, error.message)
    // don't throw — booking should succeed even if publish fails
    // notification failure should never break booking
  }
}

const getChannel = () => channel

export { connectRabbitMQ, publishMessage, getChannel }