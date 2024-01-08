import * as path from "node:path"
import { fileURLToPath } from "node:url"

export enum App {
  Member = "member",
  Archer = "archer",
}

// substitute __dirname within ESM
const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export const PROJECT_ROOT = path.resolve(dirname, "..")

export const APP_DIR = {
  [App.Member]: `${PROJECT_ROOT}/apps/90-member`,
  [App.Archer]: `${PROJECT_ROOT}/apps/90-archer`,
} as const

export const COMMIT_HASH = process.env.GITHUB_SHA || ""

export const AWS_PROFILE = process.env.AWS_PROFILE ?? ""

export const ECR_BASE_URL = "640869257465.dkr.ecr.ap-northeast-1.amazonaws.com"

export const formatTime = (date: Date) => date.toISOString().substring(11, 8)
