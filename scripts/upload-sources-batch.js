#!/usr/bin/env node
/**
 * Upload all 5 survey source CSVs to a specific Crowdin folder.
 * Uses Crowdin CLI under the hood to preserve file configuration.
 *
 * Usage:
 *   node scripts/upload-sources-batch.js [--folder "/Surveys-with-en_US"] [--delete-obsolete] [--dryrun]
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'

const SURVEYS = [
  'child_survey',
  'parent_survey_family',
  'parent_survey_child',
  'teacher_survey_general',
  'teacher_survey_classroom',
]

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = { folder: '/Surveys-with-en_US', deleteObsolete: false, dryrun: false }
  const idxFolder = args.findIndex((a) => a === '--folder')
  if (idxFolder !== -1 && args[idxFolder + 1]) opts.folder = args[idxFolder + 1]
  if (args.includes('--delete-obsolete')) opts.deleteObsolete = true
  if (args.includes('--dryrun') || args.includes('--dry-run')) opts.dryrun = true
  return opts
}

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit' })
  return res.status || 0
}

function main() {
  const { folder, deleteObsolete, dryrun } = parseArgs()
  let failures = 0
  for (const base of SURVEYS) {
    const local = path.posix.join('surveys', `${base}_translations.csv`)
    const destPattern = path.posix.join(folder, `${base}_translations_%locale%.csv`)
    const destFile = path.posix.join(folder, `${base}_translations.csv`)
    const args = ['upload', 'sources', '-c', 'crowdin.yml', '-s', local, '-t', destPattern, '--dest', destFile]
    if (deleteObsolete) args.push('--delete-obsolete')
    if (dryrun) args.push('--dryrun')
    const code = run('crowdin', args)
    if (code !== 0) failures++
  }
  if (failures > 0) {
    process.exit(1)
  }
}

main()


