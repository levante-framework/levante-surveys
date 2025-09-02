#!/usr/bin/env node

/**
 * Compare es-CO column between two Crowdin CSVs for child_survey rows.
 * Usage:
 *   node scripts/compare-es-co.js <left.csv> <right.csv>
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function parseLine(line) {
  const cols = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else { inQ = !inQ }
    } else if (ch === ',' && !inQ) {
      cols.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  cols.push(cur)
  return cols
}

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.length > 0)
  if (content.length === 0) return { header: [], rows: [] }
  const header = parseLine(content[0]).map(h => h.replace(/^"|"$/g, ''))
  const hidx = Object.fromEntries(header.map((h, i) => [h, i]))
  const rows = []
  for (let i = 1; i < content.length; i++) {
    const cols = parseLine(content[i])
    const obj = {}
    header.forEach((h, idx) => obj[h] = cols[idx] ?? '')
    rows.push(obj)
  }
  return { header, hidx, rows }
}

function main() {
  const [leftPathArg, rightPathArg] = process.argv.slice(2)
  if (!leftPathArg || !rightPathArg) {
    console.log('Usage: node scripts/compare-es-co.js <left.csv> <right.csv>')
    process.exit(1)
  }
  const leftPath = path.isAbsolute(leftPathArg) ? leftPathArg : path.resolve(process.cwd(), leftPathArg)
  const rightPath = path.isAbsolute(rightPathArg) ? rightPathArg : path.resolve(process.cwd(), rightPathArg)
  if (!fs.existsSync(leftPath) || !fs.existsSync(rightPath)) {
    console.error('❌ One or both CSVs not found')
    process.exit(1)
  }

  const left = parseCSV(leftPath)
  const right = parseCSV(rightPath)

  // Identify columns
  const requiredCols = ['identifier','labels']
  for (const col of requiredCols) {
    if (!(col in left.hidx) || !(col in right.hidx)) {
      console.error(`❌ Missing required column '${col}' in one of the files`)
      process.exit(1)
    }
  }
  const leftEsCol = ('es-CO' in left.hidx) ? 'es-CO' : (('es_CO' in left.hidx) ? 'es_CO' : null)
  const rightEsCol = ('es-CO' in right.hidx) ? 'es-CO' : (('es_CO' in right.hidx) ? 'es_CO' : null)
  if (!leftEsCol || !rightEsCol) {
    console.error('❌ es-CO column not found in one of the files')
    process.exit(1)
  }

  const strip = s => (s ?? '').replace(/^"|"$/g, '')

  // Determine English baseline columns per file
  const leftEnCol = ['en','en-US','en_US','source','text'].find(c => c in left.hidx) || null
  const rightEnCol = ['en','en-US','en_US','source','text'].find(c => c in right.hidx) || null
  if (!leftEnCol || !rightEnCol) {
    console.error('❌ Could not locate an English baseline column (en/en-US/source/text) in one of the files')
    process.exit(1)
  }

  const leftMap = new Map()
  for (const r of left.rows) {
    if (strip(r['labels']) !== 'child_survey') continue
    const id = strip(r['identifier'])
    const en = strip(r[leftEnCol])
    const key = `${id}||${en}`
    const val = strip(r[leftEsCol])
    leftMap.set(key, val)
  }

  let diffs = 0
  const missing = []
  const different = []
  for (const r of right.rows) {
    if (strip(r['labels']) !== 'child_survey') continue
    const id = strip(r['identifier'])
    const en = strip(r[rightEnCol])
    const key = `${id}||${en}`
    const val = strip(r[rightEsCol])
    if (!leftMap.has(key)) {
      missing.push(key)
      continue
    }
    const leftVal = leftMap.get(key)
    if ((leftVal || '') !== (val || '')) {
      diffs += 1
      different.push({ id, en, left: leftVal, right: val })
    }
  }

  console.log(`Compared child_survey es-CO: ${diffs} differing strings, ${missing.length} identifiers missing from left`)
  if (different.length > 0) {
    console.log('--- Differences (left vs right) ---')
    different.slice(0, 200).forEach(d => {
      console.log(`${d.id}\n  left : ${d.left}\n  right: ${d.right}\n`)
    })
    if (different.length > 200) console.log(`... (${different.length - 200} more)`)    
  }
}

main()
