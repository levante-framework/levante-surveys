#!/usr/bin/env node

/**
 * Guard: ensure no base 'es' keys exist in survey JSON files.
 * Exits with code 1 if any occurrence is found.
 *
 * Usage:
 *   node scripts/check-no-es.js            # scans surveys/*.json
 *   node scripts/check-no-es.js --all      # same as default
 *   node scripts/check-no-es.js file.json  # specific file(s)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const surveysDir = path.resolve(projectRoot, 'surveys')

function hasBaseEs(json) {
  let found = false
  function walk(obj) {
    if (found || obj == null) return
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item)
      return
    }
    if (typeof obj === 'object') {
      if (Object.prototype.hasOwnProperty.call(obj, 'es')) { found = true; return }
      for (const v of Object.values(obj)) walk(v)
    }
  }
  walk(json)
  return found
}

function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
  const files = args.length > 0
    ? args.map(p => path.isAbsolute(p) ? p : path.resolve(process.cwd(), p))
    : fs.readdirSync(surveysDir).filter(f => f.endsWith('.json')).map(f => path.join(surveysDir, f))

  let violations = []
  for (const fp of files) {
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'))
      if (hasBaseEs(data)) violations.push(fp)
    } catch (e) {
      console.error(`⚠️  Skipping unreadable JSON: ${fp} (${e.message})`)
    }
  }

  if (violations.length > 0) {
    console.error('❌ Base "es" keys detected in:')
    violations.forEach(v => console.error(`  - ${path.relative(projectRoot, v)}`))
    process.exit(1)
  }
  console.log('✅ No base "es" keys found in survey JSONs')
}

main()
