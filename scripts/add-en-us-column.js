#!/usr/bin/env node
/**
 * Append an 'en-US' column to each surveys/*_translations.csv,
 * copying values from the 'source' column.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const surveysDir = path.join(root, 'surveys')

const FILES = [
  'child_survey_translations.csv',
  'parent_survey_family_translations.csv',
  'parent_survey_child_translations.csv',
  'teacher_survey_general_translations.csv',
  'teacher_survey_classroom_translations.csv',
]

function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function escapeCsv(value) {
  const s = value == null ? '' : String(value)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/)
  if (lines.length === 0) return { updated: false, rows: 0 }
  const headerLine = lines[0]
  const headerCols = parseCsvLine(headerLine)
  const hasEnUS = headerCols.includes('en-US')
  const sourceIdx = headerCols.indexOf('source')
  if (sourceIdx === -1) throw new Error(`Missing 'source' column in ${path.basename(filePath)}`)
  if (hasEnUS) return { updated: false, rows: lines.length - 1 }

  // Append en-US to header as last column
  const newHeader = headerCols.concat(['en-US']).join(',')
  const out = [newHeader]

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const cols = parseCsvLine(line)
    const src = cols[sourceIdx] || ''
    out.push(line + ',' + escapeCsv(src))
  }

  fs.writeFileSync(filePath, out.join('\n'), 'utf8')
  return { updated: true, rows: out.length - 1 }
}

function main() {
  let totalUpdated = 0
  let totalRows = 0
  for (const name of FILES) {
    const filePath = path.join(surveysDir, name)
    if (!fs.existsSync(filePath)) {
      console.log(`Skip missing: ${name}`)
      continue
    }
    const { updated, rows } = processFile(filePath)
    totalRows += rows
    console.log(`${updated ? 'Updated' : 'No change'}: ${name} (${rows} rows)`)
    if (updated) totalUpdated++
  }
  console.log(`Done. Files updated: ${totalUpdated}, total rows: ${totalRows}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main() } catch (e) { console.error(e.message); process.exit(1) }
}


