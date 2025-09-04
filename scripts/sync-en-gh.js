#!/usr/bin/env node

/**
 * Sync en-GH to match en-US across survey JSON files (recursively).
 * If en-US is missing, fallback to en, then default.
 * Creates a timestamped backup before writing.
 *
 * Usage:
 *   node scripts/sync-en-gh.js surveys/child_survey.json
 *   node scripts/sync-en-gh.js surveys/*_updated.json
 *   node scripts/sync-en-gh.js --all   # processes surveys/*.json and surveys/*_updated.json
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { backupAndPrune } from './backup-utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const surveysDir = path.join(projectRoot, 'surveys')

function backup(filePath) {
  const { backupPath } = backupAndPrune(filePath, 3)
  return backupPath
}

function syncEnGh(obj) {
  let updated = 0
  if (obj == null) return 0
  if (Array.isArray(obj)) {
    for (const item of obj) updated += syncEnGh(item)
    return updated
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj)
    const looksMultilingual = keys.some(k => k === 'default' || k === 'en' || k === 'en-US' || k === 'en-GH' || /^[a-z]{2}(-[A-Z]{2})?$/.test(k))
    if (looksMultilingual) {
      const source = (obj['en-US'] ?? obj['en'] ?? obj['default'])
      if (typeof source === 'string') {
        if (obj['en-GH'] !== source) {
          obj['en-GH'] = source
          updated++
        }
      }
    }
    for (const k of keys) updated += syncEnGh(obj[k])
  }
  return updated
}

function processFile(p) {
  const abs = path.isAbsolute(p) ? p : path.resolve(projectRoot, p)
  if (!fs.existsSync(abs)) {
    console.error(`❌ Not found: ${abs}`)
    return { file: abs, updated: 0 }
  }
  const json = JSON.parse(fs.readFileSync(abs, 'utf8'))
  const count = syncEnGh(json)
  const b = backup(abs)
  fs.writeFileSync(abs, JSON.stringify(json, null, 2), 'utf8')
  console.log(`✅ ${path.relative(projectRoot, abs)}: synced ${count} entries (backup: ${path.relative(projectRoot, b)})`)
  return { file: abs, updated: count }
}

function main() {
  const args = process.argv.slice(2)
  let targets = []
  if (args.includes('--all')) {
    targets = fs.readdirSync(surveysDir)
      .filter(f => f.endsWith('.json'))
      .map(f => path.join('surveys', f))
  } else if (args.length > 0) {
    targets = args
  } else {
    console.log('Usage: node scripts/sync-en-gh.js <file1.json> [file2.json ...] | --all')
    process.exit(1)
  }
  let total = 0
  for (const t of targets) {
    const res = processFile(t)
    total += res.updated
  }
  console.log(`🎉 Done. Total en-GH synced: ${total}`)
}

main()
