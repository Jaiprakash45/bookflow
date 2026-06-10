import { getChannel } from "../config/rabbitmq.js"

// ─────────────────────────────────────────────────────
// NOTIFICATION WORKER
// Reads messages from RabbitMQ queues
// Processes each message and sends notification
// Acknowledges after successful processing
// ─────────────────────────────────────────────────────

// In a real app these would call an email service like SendGrid
// For now we log the notification clearly
// replacing with real email is a one line change

const sendBookingConfirmation = (data) => {
  console.log("─────────────────────────────────────")
  console.log("📧 SENDING BOOKING CONFIRMATION EMAIL")
  console.log(`   To:       ${data.user_email || "user@example.com"}`)
  console.log(`   Booking:  ${data.booking_id}`)
  console.log(`   Seat:     ${data.seat_label} (${data.category})`)
  console.log(`   Amount:   ₹${(data.amount_paise / 100).toFixed(2)}`)
  console.log(`   Event:    ${data.event_name}`)
  console.log("─────────────────────────────────────")
}

const sendCancellationNotification = (data) => {
  console.log("─────────────────────────────────────")
  console.log("📧 SENDING CANCELLATION EMAIL")
  console.log(`   To:       ${data.user_email || "user@example.com"}`)
  console.log(`   Booking:  ${data.booking_id}`)
  console.log(`   Seat:     ${data.seat_label}`)
  console.log(`   Refund:   ₹${((data.refund_paise || 0) / 100).toFixed(2)}`)
  console.log("─────────────────────────────────────")
}

const sendExpiryNotification = (data) => {
  console.log("─────────────────────────────────────")
  console.log("📧 SENDING RESERVATION EXPIRED EMAIL")
  console.log(`   To:       ${data.user_email || "user@example.com"}`)
  console.log(`   Seat:     ${data.seat_label} was released`)
  console.log(`   Message:  Your reservation timed out`)
  console.log("─────────────────────────────────────")
}

// ─────────────────────────────────────────────────────
// CONSUME QUEUE
// Sets up a listener on a queue
// For each message:
//   1. Parse the message
//   2. Process it (send notification)
//   3. Acknowledge — tell RabbitMQ it was handled
//   4. If error — reject and requeue for retry
// ─────────────────────────────────────────────────────

const consumeQueue = async (queueName, handler) => {
  const channel = getChannel()

  if (!channel) {
    console.error("RabbitMQ channel not available")
    return
  }

  // prefetch 1 → worker processes one message at a time
  // ensures fair distribution if multiple workers running
  await channel.prefetch(1)

  console.log(`👂 Listening on queue: ${queueName}`)

  channel.consume(queueName, async (message) => {
    // message is null if queue is cancelled
    if (!message) return

    try {
      // Step 1 — parse message content
      const data = JSON.parse(message.content.toString())

      console.log(`📥 Received from ${queueName}:`, data)

      // Step 2 — process the message
      await handler(data)

      // Step 3 — acknowledge success
      // this tells RabbitMQ to remove message from queue
      // if we don't ack → message stays and gets redelivered
      channel.ack(message)

    } catch (error) {
      console.error(`Error processing ${queueName} message:`, error.message)

      // Step 4 — reject message
      // second argument false → don't requeue
      // in production you'd requeue or send to dead letter queue
      // for now we reject to prevent infinite retry loop
      channel.nack(message, false, false)
    }
  })
}

// ─────────────────────────────────────────────────────
// START ALL CONSUMERS
// Called once when server starts
// Sets up listeners for all three queues
// ─────────────────────────────────────────────────────

const startNotificationWorker = async () => {
  console.log("🚀 Notification worker started")

  // listen on all three queues simultaneously
  await consumeQueue("booking.confirmed", sendBookingConfirmation)
  await consumeQueue("booking.cancelled", sendCancellationNotification)
  await consumeQueue("reservation.expired", sendExpiryNotification)
}

export { startNotificationWorker }