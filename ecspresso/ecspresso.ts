import { $ } from "zx"

import { AWS_PROFILE, COMMIT_HASH, PROJECT_ROOT, App } from "./utils"

const CMD_BASE = `SENTRY_RELEASE=${COMMIT_HASH} AWS_SDK_LOAD_CONFIG=true AWS_PROFILE=${AWS_PROFILE} ecspresso`

export const cmdFor = (app: App, imageUrl: string) =>
  `IMAGE_URL=${imageUrl} ${CMD_BASE} --config ${PROJECT_ROOT}/ecspresso/${app}/config.yaml`.split(
    " ",
  )

const getRunningTaskId = async (app: App) =>
  $`${cmdFor(app, "")} tasks --output json | jq '.taskArn' | head -1`

export const runCommand = async ({
  app = App.Member,
  command = "yarn console",
}: { app?: App; command?: string }) => {
  const taskArn = (await getRunningTaskId(app)).stdout.trim().replaceAll('"', "")
  const taskId = taskArn.substring(taskArn.lastIndexOf("/") + 1)
  await $`${cmdFor(app, "")} exec --id ${taskId} --container app --command "${command.split(" ")}"`
}
