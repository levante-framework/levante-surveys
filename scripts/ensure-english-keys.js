#!/usr/bin/env node

/**
 * Ensure English keys in survey JSON:
 * - If object has 'default' but missing 'en', set en = default
 * - If object missing 'en-US', set en-US = en (or default)
 * Creates a timestamped backup.
 *
 * Usage:
 *   node scripts/ensure-english-keys.js surveys/child_survey.json
 *   node scripts/ensure-english-keys.js surveys/child_survey_updated.json
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function backup(filePath) {
  const ts = Date.now()
  const dest = `${filePath}.backup.${ts}`
  fs.copyFileSync(filePath, dest)
  return dest
}

function ensureEnglish(obj) {
  let changed = 0
  if (obj == null) return 0
  if (Array.isArray(obj)) {
    for (const item of obj) changed += ensureEnglish(item)
    return changed
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj)
    const looksMultilingual = keys.some(k => k === 'default' || k === 'en' || k === 'en-US' || /^[a-z]{2}(-[A-Z]{2})?$/.test(k))
    if (looksMultilingual) {
      if (obj.default && !obj.en) { obj.en = obj.default; changed++ }
      if (!obj['en-US']) {
        obj['en-US'] = obj.en || obj.default || obj['en_us'] || ''
        if (obj['en-US']) changed++
      }
    }
    for (const k of keys) changed += ensureEnglish(obj[k])
  }
  return changed
}

function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.log('Usage: node scripts/ensure-english-keys.js <survey.json>')
    process.exit(1)
  }
  for (const p of args) {
    const abs = path.isAbsolute(p) ? p : path.resolve(projectRoot, p)
    if (!fs.existsSync(abs)) { console.error(`❌ Not found: ${abs}`); continue }
    const json = JSON.parse(fs.readFileSync(abs, 'utf8'))
    const changed = ensureEnglish(json)
    const b = backup(abs)
    fs.writeFileSync(abs, JSON.stringify(json, null, 2), 'utf8')
    console.log(`✅ Ensured English keys (${changed} updates) → ${path.relative(projectRoot, abs)} (backup: ${path.relative(projectRoot, b)})`)
  }
}

main()
