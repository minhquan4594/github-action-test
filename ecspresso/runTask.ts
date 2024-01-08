import { chalk } from "zx"

import { runCommand } from "./ecspresso"
import { formatTime } from "./utils"

const main = async () => {
  const startTime = new Date()
  chalk.whiteBright(`[${formatTime(startTime)}] Running Node.js console in production...`)

  await runCommand({})
}

main().catch((error) => {
  chalk.redBright("An error occurred during running task:", error)
  process.exit(1)
})
