#!/usr/bin/env node

/**
 * Remove a named column from a CSV (quote-aware) and write the result.
 *
 * Usage:
 *   node scripts/remove-csv-column.js <csv-path> --col es [--out <out-path>]
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function parseLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else { inQ = !inQ }
    } else if (ch === ',' && !inQ) {
      out.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function joinLine(cols) {
  return cols.map(c => {
    const s = c ?? ''
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? '"' + s.replace(/"/g, '""') + '"'
      : s
  }).join(',')
}

function main() {
  const args = process.argv.slice(2)
  if (args.length === 0 || !args.includes('--col')) {
    console.log('Usage: node scripts/remove-csv-column.js <csv-path> --col <columnName> [--out <out-path>]')
    process.exit(1)
  }
  const csvPathArg = args[0]
  const colIdx = args.indexOf('--col')
  const colName = args[colIdx + 1]
  const outIdx = args.indexOf('--out')
  const outPath = outIdx !== -1 ? args[outIdx + 1] : null

  const csvPath = path.isAbsolute(csvPathArg) ? csvPathArg : path.resolve(process.cwd(), csvPathArg)
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV not found: ${csvPath}`)
    process.exit(1)
  }

  const lines = fs.readFileSync(csvPath, 'utf8').split('\n')
  if (lines.length === 0) {
    console.error('❌ Empty CSV')
    process.exit(1)
  }

  const headerCols = parseLine(lines[0])
  const targetIdx = headerCols.findIndex(h => h.replace(/^"|"$/g, '') === colName)
  if (targetIdx === -1) {
    console.log(`ℹ️ Column '${colName}' not found in header; no changes made.`)
    process.exit(0)
  }

  const newHeaderCols = headerCols.filter((_, i) => i !== targetIdx)
  const outLines = [joinLine(newHeaderCols)]

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    if (raw.trim() === '') { outLines.push(raw); continue }
    const cols = parseLine(raw)
    // Guard against ragged rows
    if (targetIdx < cols.length) cols.splice(targetIdx, 1)
    outLines.push(joinLine(cols))
  }

  const dest = outPath ? (path.isAbsolute(outPath) ? outPath : path.resolve(process.cwd(), outPath)) : csvPath
  fs.writeFileSync(dest, outLines.join('\n'))
  console.log(`✅ Wrote CSV without '${colName}' column → ${dest}`)
}

main()
