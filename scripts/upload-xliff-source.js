#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = { source: '', dest: '/surveys/surveyjs.xliff', translation: '/surveys/surveyjs_%locale%.xliff', branch: 'main', config: 'crowdin.yml', dryrun: false }
  if (args[0] && !args[0].startsWith('-')) opts.source = args[0]
  const idxDest = args.findIndex(a => a === '--dest')
  if (idxDest !== -1 && args[idxDest + 1]) opts.dest = args[idxDest + 1]
  const idxTrans = args.findIndex(a => a === '-t' || a === '--translation')
  if (idxTrans !== -1 && args[idxTrans + 1]) opts.translation = args[idxTrans + 1]
  const idxBranch = args.findIndex(a => a === '-b' || a === '--branch')
  if (idxBranch !== -1 && args[idxBranch + 1]) opts.branch = args[idxBranch + 1]
  const idxCfg = args.findIndex(a => a === '-c' || a === '--config')
  if (idxCfg !== -1 && args[idxCfg + 1]) opts.config = args[idxCfg + 1]
  if (args.includes('--dryrun') || args.includes('--dry-run')) opts.dryrun = true
  return opts
}

function runCrowdin(args) {
  // Use npx to ensure CLI availability in all environments
  const res = spawnSync('npx', ['-y', '@crowdin/cli', ...args], { stdio: 'inherit' })
  return res.status || 0
}

function main() {
  const { source, dest, translation, branch, config, dryrun } = parseArgs()
  if (!source) {
    console.error('Usage: node scripts/upload-xliff-source.js <path-to-xliff> [--dest /main/surveys/surveyjs.xliff] [-c crowdin.yml] [--dryrun]')
    process.exit(1)
  }
  if (!fs.existsSync(source)) {
    console.error(`Source XLIFF not found: ${source}`)
    process.exit(1)
  }
  const args = ['upload', 'sources', '-c', config, '-s', path.posix.normalize(source), '-t', translation, '--dest', dest, '-b', branch]
  if (dryrun) args.push('--dryrun')
  const code = runCrowdin(args)
  if (code !== 0) process.exit(code)
}

main()


