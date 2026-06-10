import dotenv from "dotenv"
dotenv.config()

import { connectDB } from "./src/config/db.js"
import { app } from "./src/app.js"
import { connectRabbitMQ } from "./src/config/rabbitmq.js"
import { startCleanupWorker } from "./src/workers/reservationCleanup.worker.js"
import { startNotificationWorker } from "./src/workers/notification.worker.js"

connectDB()
  .then(async () => {
    // connect RabbitMQ before starting workers
    await connectRabbitMQ()

    // start background workers
    startCleanupWorker()
    await startNotificationWorker()

    app.listen(process.env.PORT || 3000, () => {
      console.log(`Server running on port ${process.env.PORT || 3000} 🚀`)
    })
  })
  .catch((error) => {
    console.error("Startup failed ❌", error)
    process.exit(1)
  })