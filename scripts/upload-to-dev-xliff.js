#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Storage } from '@google-cloud/storage'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const BUCKET = 'levante-assets-dev'
const DEST_PREFIX = 'surveys-xliff'

async function uploadFile(storage, localPath, destName) {
  const bucket = storage.bucket(BUCKET)
  const destination = `${DEST_PREFIX}/${destName}`
  await bucket.upload(localPath, {
    destination,
    metadata: { contentType: 'application/json', cacheControl: 'public, max-age=60' }
  })
  console.log(`✅ Uploaded ${path.basename(localPath)} → gs://${BUCKET}/${destination}`)
}

async function main() {
  const surveysDir = path.join(projectRoot, 'surveys')
  const files = fs.readdirSync(surveysDir).filter(f => f.endsWith('_updated.json'))
  if (files.length === 0) {
    console.log('ℹ️  No *_updated.json files found to upload')
    return
  }
  console.log(`📦 Uploading ${files.length} updated surveys to gs://${BUCKET}/${DEST_PREFIX}/ ...`)
  const storage = new Storage()
  for (const f of files) {
    const local = path.join(surveysDir, f)
    // Upload without the _updated suffix in the destination filename
    const destName = f.replace('_updated.json', '.json')
    await uploadFile(storage, local, destName)
  }
  console.log('🎉 Upload complete')
}

main().catch(err => { console.error('❌ Upload failed:', err.message); process.exit(1) })
