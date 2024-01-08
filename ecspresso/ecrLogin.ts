import { $, chalk } from "zx"

import { AWS_PROFILE, ECR_BASE_URL } from "./utils"

const AWS_CMD = `aws --region ap-northeast-1 --output json ${
  AWS_PROFILE ? `--profile ${AWS_PROFILE}` : ""
}`.split(" ")

export const ecrLogin = async () => {
  try {
    await $`${AWS_CMD} ecr get-login-password | docker login --username AWS --password-stdin ${ECR_BASE_URL}`
  } catch (error) {
    chalk.redBright("Failed to login:", error)
    process.exit(1)
  }
}
