#!/usr/bin/env node

/**
 * Upload the two patch surveys from surveys/patches/ to GCS buckets.
 * - Reads service account from GCP_SA_KEY (raw JSON or base64) if present; otherwise uses ADC.
 * - Backs up existing objects to surveys/backup_<timestamp>/ by default.
 * - Skips upload when remote md5 matches local (content-identical), unless --force is provided.
 *
 * Usage examples:
 *   GCP_SA_KEY="$(base64 -w0 /path/to/prod-writer.json)" node scripts/upload-patch-surveys.js --env=prod
 *   node scripts/upload-patch-surveys.js --bucket=gs://levante-assets-prod --force
 *   node scripts/upload-patch-surveys.js --env=both --no-backup
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { Storage } from '@google-cloud/storage'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const PATCH_DIR = path.join(projectRoot, 'surveys', 'patches')
const PATCH_FILES = [
  'parent_survey_child.json',
  'parent_survey_family.json'
]

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const [k, v] = a.includes('=') ? a.split('=') : [a, true]
      args[k.replace(/^--/, '')] = v === true ? true : String(v)
    } else {
      (args._ ||= []).push(a)
    }
  }
  return args
}

function resolveBuckets(args) {
  const explicitBucket = args.bucket || args.buckets
  if (explicitBucket) {
    return String(explicitBucket)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  }
  const env = String(args.env || '').toLowerCase()
  if (env === 'dev') return ['gs://levante-assets-dev']
  if (env === 'prod') return ['gs://levante-assets-prod']
  if (env === 'both') return ['gs://levante-assets-dev', 'gs://levante-assets-prod']
  // Default to prod only, safer than uploading to both by default
  return ['gs://levante-assets-prod']
}

function getServiceAccountFromEnv() {
  const key = process.env.GCP_SA_KEY
  if (!key) return null
  try {
    const json = Buffer.from(key, /^[A-Za-z0-9+/=]+$/.test(key) ? 'base64' : 'utf8').toString('utf8')
    return JSON.parse(json)
  } catch (_e) {
    try { return JSON.parse(key) } catch { return null }
  }
}

function computeFileMd5Base64(localPath) {
  const hash = crypto.createHash('md5')
  const data = fs.readFileSync(localPath)
  hash.update(data)
  return hash.digest('base64')
}

function parseBucketAndPrefix(bucketUri) {
  // Expect formats: gs://bucket or gs://bucket/prefix...
  if (!bucketUri.startsWith('gs://')) {
    throw new Error(`Invalid bucket URI: ${bucketUri}`)
  }
  const without = bucketUri.slice('gs://'.length)
  const [bucket, ...rest] = without.split('/')
  const prefix = rest.join('/')
  return { bucket, prefix }
}

async function backupIfExists(bucket, objectPath, backupRootPrefix) {
  const file = bucket.file(objectPath)
  const [exists] = await file.exists()
  if (!exists) return false
  const baseName = path.posix.basename(objectPath)
  const backupPath = path.posix.join(backupRootPrefix, baseName)
  await file.copy(bucket.file(backupPath))
  return true
}

async function uploadOne(storage, bucketName, localPath, destinationPath, options) {
  const bucket = storage.bucket(bucketName)
  const destinationFile = bucket.file(destinationPath)

  // Compare md5 to skip identical uploads unless forced
  const localMd5 = computeFileMd5Base64(localPath)
  let remoteMd5 = null
  try {
    const [meta] = await destinationFile.getMetadata()
    remoteMd5 = meta && meta.md5Hash ? meta.md5Hash : null
  } catch {
    // ignore (file probably doesn't exist)
  }

  if (!options.force && remoteMd5 && remoteMd5 === localMd5) {
    console.log(`⏭  Skipping (identical): gs://${bucketName}/${destinationPath}`)
    return { skipped: true, uploaded: false, backedUp: false }
  }

  // Backup existing if enabled
  let backedUp = false
  if (!options.noBackup) {
    const ts = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+$/, '')
    const backupRoot = `surveys/backup_${ts}`
    backedUp = await backupIfExists(bucket, destinationPath, backupRoot)
  }

  await bucket.upload(localPath, {
    destination: destinationPath,
    resumable: false,
    metadata: {
      contentType: 'application/json',
      cacheControl: 'no-cache, max-age=0'
    }
  })
  console.log(`✅ Uploaded: ${path.basename(localPath)} → gs://${bucketName}/${destinationPath}`)
  return { skipped: false, uploaded: true, backedUp }
}

async function main() {
  const args = parseArgs(process.argv)
  const buckets = resolveBuckets(args)
  const force = Boolean(args.force)
  const noBackup = Boolean(args['no-backup'] || args.noBackup)

  // Optional projectId; not strictly required for cross-project buckets if creds are valid
  const projectId = process.env.GCP_PROJECT_ID || undefined
  const credentials = getServiceAccountFromEnv()
  const storage = credentials
    ? new Storage(projectId ? { projectId, credentials } : { credentials })
    : (projectId ? new Storage({ projectId }) : new Storage())

  // Validate local files exist
  for (const f of PATCH_FILES) {
    const p = path.join(PATCH_DIR, f)
    if (!fs.existsSync(p)) {
      console.error(`❌ Missing local file: ${p}`)
      process.exitCode = 1
      return
    }
  }

  for (const bucketUri of buckets) {
    const { bucket, prefix } = parseBucketAndPrefix(bucketUri)
    const basePrefix = prefix ? `${prefix.replace(/\/$/, '')}/surveys` : 'surveys'

    console.log(`\n☁️  Target bucket: gs://${bucket} | prefix: ${basePrefix}`)
    for (const fileName of PATCH_FILES) {
      const localPath = path.join(PATCH_DIR, fileName)
      const destinationPath = `${basePrefix}/${fileName}`
      try {
        await uploadOne(storage, bucket, localPath, destinationPath, { force, noBackup })
      } catch (e) {
        console.error(`❌ Failed uploading ${fileName} → gs://${bucket}/${destinationPath}: ${e.message || e}`)
        process.exitCode = 1
      }
    }
  }
}

main().catch(err => {
  console.error('❌ Unexpected error:', err?.stack || err?.message || String(err))
  process.exit(1)
})


