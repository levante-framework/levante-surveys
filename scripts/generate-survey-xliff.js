#!/usr/bin/env node

/**
 * Generate XLIFF 1.2 files from a survey Crowdin CSV.
 * - Emits one source-only XLIFF (source-language=en-US by default)
 * - Emits one bilingual XLIFF per target language present in the CSV
 *
 * Usage:
 *   node scripts/generate-survey-xliff.js surveys/child_survey_crowdin_translations.csv [--source-lang en-US]
 *   node scripts/generate-survey-xliff.js --all
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const argv = process.argv.slice(2)
const isAll = argv.includes('--all')
const srcArg = argv.find(a => a.endsWith('.csv'))
const sourceLangFlagIdx = argv.findIndex(a => a === '--source-lang')
const SOURCE_LANG = sourceLangFlagIdx !== -1 && argv[sourceLangFlagIdx + 1] ? argv[sourceLangFlagIdx + 1] : 'en-US'

const SURVEYS_DIR = path.resolve(projectRoot, 'surveys')
const OUT_DIR = path.resolve(projectRoot, 'xliff-out')

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function parseCSV(csvContent) {
  const lines = csvContent.split('\n').filter(l => l.trim().length > 0)
  if (lines.length < 2) return { header: [], rows: [] }
  const parseLine = (line) => {
    const result = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
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
  const header = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map(l => parseLine(l))
  return { header, rows }
}

function toCData(text) {
  if (text == null) return ''
  return `<![CDATA[${text}]]>`
}

function buildXLIFF({ surveyName, units, sourceLang, targetLang }) {
  const originalName = `${surveyName}_translations.csv`
  const fileAttrs = targetLang
    ? `original="${originalName}" source-language="${sourceLang}" target-language="${targetLang}" datatype="plaintext"`
    : `original="${originalName}" source-language="${sourceLang}" datatype="plaintext"`

  const body = units.map(u => {
    const src = toCData(u.source)
    const tgt = targetLang ? `\n      <target state="translated">${toCData(u.target)}</target>` : ''
    return `    <trans-unit id="${u.id}" resname="${u.id}" approved="yes">
      <source xml:space="preserve">${src}</source>${tgt}
    </trans-unit>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<xliff version="1.2">\n  <file ${fileAttrs}>\n    <body>\n${body}\n    </body>\n  </file>\n</xliff>\n`
}

function inferSurveyNameFromCsv(csvPath) {
  const base = path.basename(csvPath)
  // child_survey_crowdin_translations.csv → child_survey
  const m = base.match(/^(.*?)(?:_crowdin)?_translations\.csv$/)
  return m ? m[1] : base.replace(/\.csv$/, '')
}

function generateForCsv(csvPath) {
  const csv = readFile(csvPath)
  const { header, rows } = parseCSV(csv)
  if (header.length === 0) {
    console.error(`No header parsed for ${csvPath}`)
    return
  }

  const colIndex = Object.fromEntries(header.map((h, i) => [h, i]))
  const idIdx = colIndex['identifier']
  if (idIdx == null) {
    console.error(`Missing 'identifier' column in ${csvPath}`)
    return
  }

  // Prefer en-US for source; fallback to 'source'
  const sourceIdx = colIndex['en-US'] ?? colIndex['source']
  if (sourceIdx == null) {
    console.error(`Missing 'en-US' or 'source' column in ${csvPath}`)
    return
  }

  // Collect target languages present (exclude identifier, labels, en-US, source)
  const targetLangs = header.filter(h => !['identifier', 'labels', 'en-US', 'source'].includes(h))

  const surveyName = inferSurveyNameFromCsv(csvPath)
  const outDir = path.join(OUT_DIR, surveyName)
  ensureDir(outDir)

  // Build trans-units
  const units = rows.map(cols => {
    const id = (cols[idIdx] || '').replace(/^"|"$/g, '')
    const source = (cols[sourceIdx] || '').replace(/^"|"$/g, '')
    return { id, source, row: cols }
  })

  // Emit source-only XLIFF
  const sourceXliff = buildXLIFF({ surveyName, units, sourceLang: SOURCE_LANG })
  const sourceOut = path.join(outDir, `${surveyName}-source.xliff`)
  fs.writeFileSync(sourceOut, sourceXliff, 'utf8')
  console.log(`✅ Wrote ${sourceOut}`)

  // Emit one bilingual per target language
  for (const lang of targetLangs) {
    const langIdx = colIndex[lang]
    const langUnits = units.map(u => ({ id: u.id, source: u.source, target: (u.row[langIdx] || '').replace(/^"|"$/g, '') }))
    const xliff = buildXLIFF({ surveyName, units: langUnits, sourceLang: SOURCE_LANG, targetLang: lang })
    const outPath = path.join(outDir, `${surveyName}-${lang}.xliff`)
    fs.writeFileSync(outPath, xliff, 'utf8')
    console.log(`✅ Wrote ${outPath}`)
  }
}

function main() {
  ensureDir(OUT_DIR)

  if (isAll) {
    const files = fs.readdirSync(SURVEYS_DIR)
      .filter(f => f.endsWith('_crowdin_translations.csv') || f.endsWith('_translations.csv'))
    if (files.length === 0) {
      console.log('No survey CSV files found under surveys/')
      return
    }
    for (const f of files) {
      generateForCsv(path.join(SURVEYS_DIR, f))
    }
    return
  }

  if (!srcArg) {
    console.log('Usage: node scripts/generate-survey-xliff.js <path-to-csv> [--source-lang en-US] | --all')
    process.exit(1)
  }

  const csvPath = path.isAbsolute(srcArg) ? srcArg : path.resolve(process.cwd(), srcArg)
  generateForCsv(csvPath)
}

main()
