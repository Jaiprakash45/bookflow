import dotenv from "dotenv"

// load env first before anything else
dotenv.config()

import { connectDB } from "./src/config/db.js"
import {app} from "./src/app.js"
import redis from "./src/config/redis.js"
import { startCleanupWorker } from "./src/workers/reservationCleanup.worker.js"
connectDB()
  .then(() => {
    // start cleanup worker after DB is connected
    startCleanupWorker()

    app.listen(process.env.PORT || 3000, () => {
      console.log(`Server running on port ${process.env.PORT || 3000} 🚀`)
    })
  })
  .catch((error) => {
    console.error("Startup failed ❌", error)
    process.exit(1)
  })