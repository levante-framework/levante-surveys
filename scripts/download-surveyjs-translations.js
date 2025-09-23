#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import path from 'node:path'

const configPath = path.resolve('crowdin-xliff-surveyjs.yml')

function runCrowdin(args) {
  const res = spawnSync('npx', ['-y', '@crowdin/cli', ...args], { stdio: 'inherit' })
  return res.status || 0
}

function main() {
  const code = runCrowdin(['download', '-c', configPath])
  if (code !== 0) process.exit(code)
}

main()


