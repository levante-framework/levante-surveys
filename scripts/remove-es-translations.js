#!/usr/bin/env node

/**
 * Remove 'es' translations from Survey JSON files.
 * Keeps regional Spanish variants like 'es-CO' and 'es-AR'.
 * Creates a timestamped backup before writing changes.
 *
 * Usage:
 *   node scripts/remove-es-translations.js surveys/child_survey.json
 *   node scripts/remove-es-translations.js surveys/child_survey_updated.json
 *   node scripts/remove-es-translations.js --all
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { backupAndPrune } from './backup-utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const SURVEYS_DIR = path.resolve(projectRoot, 'surveys')

function makeBackup(filePath) {
  const { backupPath } = backupAndPrune(filePath, 3)
  return backupPath
}

function removeEsKeys(obj) {
  if (obj == null) return { removed: 0 }
  let removed = 0

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const r = removeEsKeys(obj[i])
      removed += r.removed
    }
    return { removed }
  }

  if (typeof obj === 'object') {
    // If this object looks like a multilingual blob, drop 'es'
    if (Object.prototype.hasOwnProperty.call(obj, 'es')) {
      delete obj.es
      removed += 1
    }
    for (const key of Object.keys(obj)) {
      const r = removeEsKeys(obj[key])
      removed += r.removed
    }
  }
  return { removed }
}

function processFile(targetPath) {
  const abs = path.isAbsolute(targetPath) ? targetPath : path.resolve(projectRoot, targetPath)
  if (!fs.existsSync(abs)) {
    console.error(`❌ File not found: ${abs}`)
    process.exitCode = 1
    return
  }
  const json = JSON.parse(fs.readFileSync(abs, 'utf8'))
  const { removed } = removeEsKeys(json)
  const backupPath = makeBackup(abs)
  fs.writeFileSync(abs, JSON.stringify(json, null, 2), 'utf8')
  console.log(`✅ Removed ${removed} 'es' keys → wrote ${path.relative(projectRoot, abs)} (backup: ${path.relative(projectRoot, backupPath)})`)
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--all')) {
    const files = fs.readdirSync(SURVEYS_DIR).filter(f => f.endsWith('.json'))
    for (const f of files) {
      processFile(path.join(SURVEYS_DIR, f))
    }
    return
  }
  if (args.length === 0) {
    console.log('Usage: node scripts/remove-es-translations.js <survey.json> | --all')
    process.exit(1)
  }
  for (const a of args) processFile(a)
}

main()
