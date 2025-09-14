#!/usr/bin/env node

/**
 * Apply all combined XLIFF files in translations/xliff to surveys JSONs.
 * For each file matching *-surveys.xliff, runs import-xliff-combined.
 *
 * Usage:
 *   node scripts/import-xliff-all.js [--xliff-dir translations/xliff] [--surveys-dir surveys] [--out-dir surveys] [--inplace]
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
const xliffDir = path.resolve(process.cwd(), args.includes('--xliff-dir') ? args[args.indexOf('--xliff-dir') + 1] : 'translations/xliff')
const surveysDir = path.resolve(process.cwd(), args.includes('--surveys-dir') ? args[args.indexOf('--surveys-dir') + 1] : 'surveys')
const outDir = path.resolve(process.cwd(), args.includes('--out-dir') ? args[args.indexOf('--out-dir') + 1] : 'surveys')
const inplace = args.includes('--inplace')

if (!fs.existsSync(xliffDir)) {
  console.error(`❌ XLIFF directory not found: ${xliffDir}`)
  process.exit(1)
}

const files = fs.readdirSync(xliffDir).filter(f => f.endsWith('-surveys.xliff'))
if (files.length === 0) {
  console.error(`❌ No files matching *-surveys.xliff in ${xliffDir}`)
  process.exit(1)
}

console.log('📥 Importing combined XLIFF files')
console.log('='.repeat(50))
console.log(`📁 XLIFF dir:   ${xliffDir}`)
console.log(`📁 Surveys dir: ${surveysDir}`)
console.log(`📁 Output dir:  ${inplace ? '(in-place overwrite)' : outDir}`)
console.log('')

let successCount = 0
for (const f of files) {
  const full = path.join(xliffDir, f)
  console.log(`➡️  ${f}`)
  const cmdArgs = [path.join(projectRoot, 'scripts', 'import-xliff-combined.js'), full, '--surveys-dir', surveysDir]
  if (inplace) {
    cmdArgs.push('--inplace')
  } else {
    cmdArgs.push('--out-dir', outDir)
  }
  const res = spawnSync(process.execPath, cmdArgs, { stdio: 'inherit' })
  if (res.status === 0) successCount++
}

console.log('\n📊 Summary')
console.log('='.repeat(20))
console.log(`✅ Successful: ${successCount}/${files.length}`)
process.exit(successCount === files.length ? 0 : 1)


