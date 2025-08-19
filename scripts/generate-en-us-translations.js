#!/usr/bin/env node
/**
 * Generate monolingual en-US translation CSVs by copying the 'source' column
 * to a 'translation' column for each survey file. These files can be uploaded
 * with `crowdin upload translations -l en-US` using the existing translation
 * path mapping in crowdin.yml.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const surveysDir = path.join(root, 'surveys')

const SOURCE_FILES = [
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
  return result.map((v) => v.trim())
}

function escapeCsv(value) {
  const s = value == null ? '' : String(value)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function generateMonolingual(sourcePath, outputPath) {
  const content = fs.readFileSync(sourcePath, 'utf8')
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return 0
  const header = parseCsvLine(lines[0])
  const idIdx = header.indexOf('identifier')
  const sourceIdx = header.indexOf('source')
  if (idIdx === -1 || sourceIdx === -1) {
    throw new Error(`Missing identifier/source columns in ${path.basename(sourcePath)}`)
  }
  const out = []
  out.push('identifier,translation')
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    const id = cols[idIdx] || ''
    const src = cols[sourceIdx] || ''
    out.push(`${escapeCsv(id)},${escapeCsv(src)}`)
  }
  fs.writeFileSync(outputPath, out.join('\n'), 'utf8')
  return out.length - 1
}

function main() {
  if (!fs.existsSync(surveysDir)) {
    throw new Error(`Surveys directory not found: ${surveysDir}`)
  }
  let total = 0
  for (const file of SOURCE_FILES) {
    const src = path.join(surveysDir, file)
    if (!fs.existsSync(src)) {
      console.log(`Skip missing: ${file}`)
      continue
    }
    const out = path.join(
      surveysDir,
      file.replace('_translations.csv', `_translations_en-US.csv`)
    )
    const count = generateMonolingual(src, out)
    total += count
    console.log(`Generated ${path.basename(out)} with ${count} rows`)
  }
  console.log(`Done. Total rows: ${total}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main()
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}


