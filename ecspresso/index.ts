import { $, chalk } from "zx"

import { buildImage } from "./buildImage"
import { ecrLogin } from "./ecrLogin"
import { cmdFor as ecspressoCmdFor } from "./ecspresso"
import { prebuild } from "./prebuild"
import { App, COMMIT_HASH, formatTime } from "./utils"

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  return `${minutes}:${remainingSeconds.toFixed(0).padStart(2, "0")}`
}

const main = async (targetApp: App | undefined) => {
  const startTime = new Date()
  chalk.whiteBright(`[${formatTime(startTime)}] Deploying revision ${COMMIT_HASH}`)

  const apps = targetApp ? [targetApp] : [App.Member, App.Archer]
  chalk.blueBright("Copying packages within monorepo...")
  await prebuild(apps)

  const images: { app: App; url: string }[] = []
  chalk.blueBright("Building and pushing images...")
  await Promise.all(
    apps.map(async (app) => {
      const imageUrl = await buildImage(app)
      images.push({ app, url: imageUrl })
      await ecrLogin()
      await $`docker push ${imageUrl}`
    }),
  )

  chalk.blueBright("Deploying...")
  await Promise.all(
    images.map(async (image) => {
      await $`${ecspressoCmdFor(image.app, image.url)} deploy --force-new-deployment`
    }),
  )

  const endTime = new Date()
  const elapsedTime = (endTime.getTime() - startTime.getTime()) / 1000
  chalk.greenBright(`[${formatTime(endTime)}] deploy finished in ${formatDuration(elapsedTime)}`)
}

const selectApp = () => {
  const targetApp = process.argv[2] as unknown as App | undefined
  if (![App.Archer, App.Member, undefined].includes(targetApp)) {
    chalk.redBright('Invalid target app. Please specify "member", "archer", or none for both.')
    process.exit(1)
  }

  return targetApp
}

const app = selectApp()
main(app).catch((error) => {
  chalk.redBright("An error occurred during deployment:", error)
  process.exit(1)
})
