import { $, chalk } from "zx"

import { APP_DIR, COMMIT_HASH, ECR_BASE_URL } from "./utils"

import type { App } from "./utils"

const REPO = {
  member: "archers90-member",
  archer: "archers90-archer",
}
const imageTaggedName = (app: App) => `${REPO[app]}:${COMMIT_HASH}`
const imageUrl = (app: App) => `${ECR_BASE_URL}/${imageTaggedName(app)}`
const tags = (app: App) => [imageUrl(app)]

const envVars = ["NEXT_PUBLIC_CHANNEL_TALK_PLUGIN_KEY", "SENTRY_AUTH_TOKEN"]

const buildArgs = envVars
  .map((v) => `--build-arg ${v}=${process.env[v]}`)
  .map((a) => a.split(" "))
  .flat()

// eslint-disable-next-line consistent-return
export const buildImage = async (app: App) => {
  if (!envVars.every((v) => process.env[v])) {
    chalk.redBright(
      "Missing environment variables",
      process.env.NEXT_PUBLIC_CHANNEL_TALK_PLUGIN_KEY,
      process.env.SENTRY_AUTH_TOKEN,
    )
    process.exit(1)
  }
  try {
    const appPath = APP_DIR[app]
    await $`cd ${appPath} && docker buildx build ${buildArgs} --platform=linux/amd64 --tag ${tags(
      app,
    ).join(",")} .`

    return imageUrl(app)
  } catch (error) {
    chalk.redBright(`Failed to build ${app} image:`, error)
    process.exit(1)
  }
}
