import dotenv from "dotenv"

// load env first before anything else
dotenv.config()

import { connectDB } from "./src/config/db.js"
import {app} from "./src/app.js"

connectDB()
  .then(() => {
    app.listen(process.env.PORT || 3000, () => {
      console.log(`Server running on port ${process.env.PORT || 3000} 🚀`)
    })
  })
  .catch((error) => {
    console.error("Startup failed ❌", error)
    process.exit(1)
  })