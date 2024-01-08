import { readFile, writeFile } from "node:fs/promises"
import * as path from "node:path"

import { $ } from "zx"

import { APP_DIR, PROJECT_ROOT } from "./utils"

import type { App } from "./utils"

export const prebuild = async (apps: App[]) =>
  Promise.all(
    apps.map(async (app) => {
      const appPath = APP_DIR[app]

      await $`cp ../yarn.lock ${appPath}`
      await $`mkdir -p ${appPath}/prisma && cp ../packages/archer-database/prisma/schema.prisma ${appPath}/prisma/`

      // replace monorepo package with local package
      await $`cp -r ../packages/archer-database ${appPath}/`
      await $`cp -r ../packages/utils ${appPath}/`

      const packageJsonPath = path.join(appPath, "package.json")
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8")) as Record<
        string,
        unknown
      >

      const save = async (updatedJson: object) => {
        await writeFile(packageJsonPath, JSON.stringify(updatedJson, null, 2), undefined)
      }

      const removePackage = async (name: string, type: string) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        delete packageJson[type]?.[name]
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        await save(packageJson)
      }

      const localizePackage = async (name: string, localPath = ".") => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        packageJson.dependencies[name] = `file:${localPath}/${name}`
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        await save(packageJson)
      }

      await Promise.all([
        await removePackage("prisma-erd-generator", "optionalDependencies"),
        await removePackage("@prisma/generator-helper", "optionalDependencies"),
        await removePackage("schema", "prisma"),
        await localizePackage("archer-database"),
        await localizePackage("utils"),
      ])

      const rootPackageJsonPath = path.join(PROJECT_ROOT, "package.json")
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf-8"))
      const packagesToCopy = [
        "@emotion/react",
        "@emotion/styled",
        "@hookform/resolvers",
        "@mui/material",
        "@mui/x-date-pickers",
        "@next-auth/prisma-adapter",
        "@prisma/client",
        "@sendgrid/mail",
        "date-fns",
        "next-auth",
        "nodemailer",
        "@types/nodemailer",
        "prisma",
        "react",
        "react-dom",
        "react-hook-form",
        "zod",
        "zod-i18n-map",
        "@sentry/nextjs",
      ]
      for (const packageName of packagesToCopy) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        packageJson.dependencies[packageName] = rootPackageJson.devDependencies[packageName]
      }

      const devPackagesToCopy = ["typescript", "@types/node", "@tanstack/react-query-devtools"]

      for (const packageName of devPackagesToCopy) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        packageJson.devDependencies[packageName] = rootPackageJson.devDependencies[packageName]
      }

      // remove erd generator block
      const prismaSchemaPath = path.join(appPath, "archer-database/prisma/schema.prisma")
      const prismaSchema = await readFile(prismaSchemaPath, "utf-8")
      await writeFile(
        prismaSchemaPath,
        prismaSchema.replace(/.*generator erd {([\s\S]*?)}/, ""),
        undefined,
      )

      packageJson.prisma = {
        schema: "archer-database/prisma/schema.prisma",
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await save(packageJson)

      // merge tsconfig.json
      await $`cd ${appPath} && mv tsconfig.json tsconfig.json.old && jq -s '.[0] * .[1] | del(.extends)' ../../tsconfig.json tsconfig.json.old > tsconfig.json`
    }),
  )
