#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

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

function joinLine(cols) {
  return cols.map(c => {
    const s = c ?? ''
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? '"' + s.replace(/"/g, '""') + '"'
      : s
  }).join(',')
}

function main() {
  const inArg = process.argv[2] || 'surveys.csv'
  const outArg = process.argv[3] || 'surveys/child_survey_crowdin_translations.csv'
  if (!fs.existsSync(inArg)) {
    console.error(`❌ Input CSV not found: ${inArg}`)
    process.exit(1)
  }
  const lines = fs.readFileSync(inArg, 'utf8').split('\n').filter(l => l.length > 0)
  if (lines.length < 2) {
    console.error('❌ Input CSV has no data')
    process.exit(1)
  }
  const headerCols = parseLine(lines[0])
  const hidx = Object.fromEntries(headerCols.map((h,i)=>[h.replace(/^"|"$/g,''), i]))
  if (!('labels' in hidx) || !('identifier' in hidx)) {
    console.error('❌ Combined CSV missing required columns (labels, identifier)')
    process.exit(1)
  }

  const outLines = [lines[0]]
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i])
    const labels = (cols[hidx['labels']] ?? '').replace(/^"|"$/g,'')
    if (labels === 'child_survey') outLines.push(joinLine(cols))
  }
  fs.writeFileSync(outArg, outLines.join('\n'))
  console.log(`✅ Wrote ${outArg} with ${outLines.length - 1} rows`)
}

main()
