#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { normalizeDefaultsFromValues } from './normalize-utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function normalizeFile(jsonPath) {
  const abs = path.isAbsolute(jsonPath) ? jsonPath : path.resolve(projectRoot, jsonPath)
  if (!fs.existsSync(abs)) {
    console.error(`❌ Not found: ${abs}`)
    return 0
  }
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'))
  const count = normalizeDefaultsFromValues(data)
  if (count > 0) {
    fs.writeFileSync(abs.replace(/\.json$/, '_updated.json'), JSON.stringify(data, null, 2), 'utf8')
    console.log(`✅ ${path.basename(abs)}: normalized ${count} items → wrote _updated.json`)
  } else {
    console.log(`ℹ️ ${path.basename(abs)}: no changes`)
  }
  return count
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--all')) {
    const surveysDir = path.resolve(projectRoot, 'surveys')
    const files = fs.readdirSync(surveysDir).filter(f => f.endsWith('.json'))
    let total = 0
    for (const f of files) total += normalizeFile(path.join('surveys', f))
    console.log(`\n📊 Total normalized: ${total}`)
    return
  }
  if (args.length === 0) {
    console.log('Usage: node scripts/normalize-survey-defaults.js <survey.json> | --all')
    process.exit(1)
  }
  for (const a of args) normalizeFile(a)
}

main()


