#!/usr/bin/env node
/**
 * Merge translations from Crowdin CSVs into local *_translations.csv files,
 * preserving local 'source' and ensuring an 'en-US' column.
 *
 * Usage:
 *   node scripts/merge-crowdin-into-local.js [--seed-en-us] [--file <name>]
 *   - Default merges all five surveys.
 *   - --seed-en-us: if en-US is missing for a row, copy from 'source'.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const surveysDir = path.join(root, 'surveys')

const SURVEYS = [
  {
    local: 'child_survey_translations.csv',
    crowdin: 'child_survey_crowdin_translations.csv',
  },
  {
    local: 'parent_survey_family_translations.csv',
    crowdin: 'parent_survey_family_crowdin_translations.csv',
  },
  {
    local: 'parent_survey_child_translations.csv',
    crowdin: 'parent_survey_child_crowdin_translations.csv',
  },
  {
    local: 'teacher_survey_general_translations.csv',
    crowdin: 'teacher_survey_general_crowdin_translations.csv',
  },
  {
    local: 'teacher_survey_classroom_translations.csv',
    crowdin: 'teacher_survey_classroom_crowdin_translations.csv',
  },
]

function parseArgs() {
  const args = process.argv.slice(2)
  const flags = { seedEnUS: args.includes('--seed-en-us'), file: null }
  const idx = args.findIndex((a) => a === '--file')
  if (idx !== -1 && args[idx + 1]) flags.file = args[idx + 1]
  return flags
}

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ',' && !inQuotes) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function joinCsvLine(values) {
  return values.map((v) => {
    const s = v == null ? '' : String(v)
    return (s.includes('"') || s.includes(',') || s.includes('\n'))
      ? '"' + s.replace(/"/g, '""') + '"'
      : s
  }).join(',')
}

function readCsv(filepath) {
  const content = fs.readFileSync(filepath, 'utf8')
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return { header: [], rows: [] }
  const header = parseCsvLine(lines[0])
  const rows = lines.slice(1).map((l) => parseCsvLine(l))
  return { header, rows }
}

function indexByIdentifier(header, rows) {
  const idIdx = header.indexOf('identifier')
  const labelsIdx = header.indexOf('labels')
  const map = new Map()
  for (const cols of rows) {
    const id = cols[idIdx]
    if (!id) continue
    map.set(id, { cols, labels: labelsIdx >= 0 ? cols[labelsIdx] : '' })
  }
  return map
}

function isLanguageCol(name) {
  if (!name) return false
  if (name === 'identifier' || name === 'labels' || name === 'source') return false
  // allow BCP47 like de, de-CH, es-AR, en-US, fr_CA, etc.
  return /^[a-z]{2}([_-][A-Za-z]{2})?$/.test(name)
}

function mergeOne(localPath, crowdinPath, seedEnUS) {
  if (!fs.existsSync(localPath)) throw new Error(`Missing local file: ${path.basename(localPath)}`)
  if (!fs.existsSync(crowdinPath)) throw new Error(`Missing Crowdin file: ${path.basename(crowdinPath)}`)

  const local = readCsv(localPath)
  const crowd = readCsv(crowdinPath)

  const idIdxLocal = local.header.indexOf('identifier')
  const sourceIdxLocal = local.header.indexOf('source')
  if (idIdxLocal === -1) throw new Error(`Local file missing 'identifier': ${path.basename(localPath)}`)
  if (sourceIdxLocal === -1) throw new Error(`Local file missing 'source': ${path.basename(localPath)}`)

  const idIdxCrowd = crowd.header.indexOf('identifier')
  if (idIdxCrowd === -1) throw new Error(`Crowdin file missing 'identifier': ${path.basename(crowdinPath)}`)

  const localMap = indexByIdentifier(local.header, local.rows)
  const crowdMap = indexByIdentifier(crowd.header, crowd.rows)

  // Build final header
  const labelPresent = local.header.includes('labels') || crowd.header.includes('labels')
  const languageSet = new Set()
  // Always include source and en-US
  languageSet.add('source')
  languageSet.add('en-US')
  for (const h of [...local.header, ...crowd.header]) {
    if (isLanguageCol(h)) languageSet.add(h)
  }
  // Remove any duplicate en/en_US collisions
  // Normalize variants consistently (keep what appears as-is)

  const finalLanguages = Array.from(languageSet)
    .filter((l) => l !== 'identifier' && l !== 'labels')
    .filter((l, i, a) => a.indexOf(l) === i)

  const finalHeader = ['identifier']
  if (labelPresent) finalHeader.push('labels')
  finalHeader.push(...finalLanguages)

  // Build output rows in local identifier order
  const out = [joinCsvLine(finalHeader)]
  for (const [id, localEntry] of localMap.entries()) {
    const row = new Array(finalHeader.length).fill('')
    // set identifier and labels
    row[0] = id
    let cursor = 1
    if (labelPresent) {
      row[cursor] = localEntry.labels || ''
      cursor += 1
    }
    // prepare lookup maps by header
    const localIdx = new Map(local.header.map((h, i) => [h, i]))
    const crowdIdx = new Map(crowd.header.map((h, i) => [h, i]))
    const crowdEntry = crowdMap.get(id)

    for (let j = 0; j < finalLanguages.length; j++) {
      const lang = finalLanguages[j]
      const targetIdx = cursor + j
      if (lang === 'source') {
        row[targetIdx] = localEntry.cols[sourceIdxLocal] || ''
        continue
      }
      // Prefer Crowdin value, fall back to local
      let val = ''
      if (crowdEntry && crowdIdx.has(lang)) {
        const ci = crowdIdx.get(lang)
        val = crowdEntry.cols[ci] || ''
      }
      if (!val && localIdx.has(lang)) {
        const li = localIdx.get(lang)
        val = localEntry.cols[li] || ''
      }
      if (!val && lang === 'en-US' && seedEnUS) {
        // seed en-US from source if missing
        val = localEntry.cols[sourceIdxLocal] || ''
      }
      row[targetIdx] = val
    }
    out.push(joinCsvLine(row))
  }

  fs.writeFileSync(localPath, out.join('\n'), 'utf8')
  return { rows: out.length - 1, languages: finalLanguages.length }
}

function main() {
  const { seedEnUS, file } = parseArgs()
  const targets = file
    ? SURVEYS.filter((s) => s.local === file || s.crowdin === file || file.includes(s.local.split('_translations.csv')[0]))
    : SURVEYS

  for (const t of targets) {
    const localPath = path.join(surveysDir, t.local)
    const crowdinPath = path.join(surveysDir, t.crowdin)
    if (!fs.existsSync(localPath)) {
      console.log(`Skip (missing local): ${t.local}`)
      continue
    }
    if (!fs.existsSync(crowdinPath)) {
      console.log(`Skip (missing crowdin): ${t.crowdin}`)
      continue
    }
    try {
      const res = mergeOne(localPath, crowdinPath, seedEnUS)
      console.log(`Merged: ${t.local} (${res.rows} rows, ${res.languages} language columns)`)
    } catch (e) {
      console.log(`Failed: ${t.local} -> ${e.message}`)
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}


