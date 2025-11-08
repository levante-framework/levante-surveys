#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawnSync } from 'child_process'

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const surveysDir = path.join(projectRoot, 'surveys')
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'levante-surveys-deploy-'))
const outDir = path.join(tmpDir, 'surveys')
fs.mkdirSync(outDir, { recursive: true })

const SURVEY_JSON_FILES = [
  'child_survey.json',
  'parent_survey_family.json',
  'parent_survey_child.json',
  'teacher_survey_general.json',
  'teacher_survey_classroom.json'
]

function copyUpdatedFiles() {
  let copied = 0
  for (const jsonFile of SURVEY_JSON_FILES) {
    const base = jsonFile.replace(/\.json$/i, '')
    const updated = path.join(surveysDir, `${base}_updated.json`)
    const dest = path.join(outDir, jsonFile)
    if (!fs.existsSync(updated)) {
      console.warn(`⚠️  Missing updated file: ${path.basename(updated)}`)
      continue
    }
    const data = fs.readFileSync(updated, 'utf8')
    fs.writeFileSync(dest, data, 'utf8')
    console.log(`📄 Prepared: ${path.basename(updated)} → ${path.relative(tmpDir, dest)}`)
    copied++
  }
  if (copied === 0) {
    console.error('❌ No *_updated.json files were found to deploy')
    process.exit(1)
  }
}

function rsyncToBucket(bucketUri) {
  console.log(`☁️  Syncing to ${bucketUri} (gsutil -m rsync) ...`)
  const res = spawnSync('bash', ['-lc', `gsutil -m rsync -r ${outDir} ${bucketUri}`], { stdio: 'inherit' })
  if (res.status !== 0) {
    console.error('❌ gsutil rsync failed')
    process.exit(res.status || 1)
  }
  console.log('✅ Sync complete')
}

function main() {
  copyUpdatedFiles()
  // CLI args: --bucket=levante-assets-dev|levante-assets-prod or --env=DEV|PROD
  const args = process.argv.slice(2)
  const bucketArg = args.find(a => a.startsWith('--bucket='))
  const envArg = args.find(a => a.startsWith('--env='))
  let bucketName = 'levante-assets-dev'
  if (envArg) {
    const env = envArg.split('=')[1].toUpperCase()
    if (env === 'PROD' || env === 'PRODUCTION') {
      bucketName = 'levante-assets-prod'
    } else if (env === 'DEV' || env === 'DEVELOPMENT') {
      bucketName = 'levante-assets-dev'
    }
  }
  if (bucketArg) {
    const val = bucketArg.split('=')[1]
    if (val && !val.startsWith('gs://')) {
      bucketName = val
    }
  }
  const bucketUri = bucketName.startsWith('gs://') ? bucketName : `gs://${bucketName}/surveys`
  rsyncToBucket(bucketUri)
}

main()






