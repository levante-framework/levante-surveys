#!/usr/bin/env node

/**
 * Export XLIFF 1.2 from Survey JSON directly (avoids CSV).
 * - Emits one source-only XLIFF (source-language=en-US by default)
 * - Emits one bilingual XLIFF per discovered target language
 *
 * Usage:
 *   node scripts/export-xliff-from-json.js surveys/child_survey.json [--source-lang en-US]
 *   node scripts/export-xliff-from-json.js --all
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const argv = process.argv.slice(2)
const isAll = argv.includes('--all')
const srcArg = argv.find(a => a.endsWith('.json'))
const sourceLangFlagIdx = argv.findIndex(a => a === '--source-lang')
const SOURCE_LANG = sourceLangFlagIdx !== -1 && argv[sourceLangFlagIdx + 1] ? argv[sourceLangFlagIdx + 1] : 'en-US'

const SURVEYS_DIR = path.resolve(projectRoot, 'surveys')
const OUT_DIR = path.resolve(projectRoot, 'xliff-out')

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }) }

function isLanguageKey(key) {
  return key === 'default' || /^[a-z]{2}(-[A-Z]{2})?$/.test(key) || /^[a-z]{2}(_[a-z]{2})?$/i.test(key)
}

function normalizeLangKey(key) {
  if (key === 'default') return 'default'
  if (key.includes('_')) {
    const [l, r] = key.split('_')
    return `${l}-${r.toUpperCase()}`
  }
  if (/^[a-z]{2}-[a-z]{2}$/i.test(key)) {
    const [l, r] = key.split('-')
    return `${l}-${r.toUpperCase()}`
  }
  return key
}

function toCData(text) {
  if (text == null) return ''
  return `<![CDATA[${text}]]>`
}

function buildXLIFF({ surveyName, units, sourceLang, targetLang }) {
  const originalName = `${surveyName}.json`
  const fileAttrs = targetLang
    ? `original="${originalName}" source-language="${sourceLang}" target-language="${targetLang}" datatype="plaintext"`
    : `original="${originalName}" source-language="${sourceLang}" datatype="plaintext"`

  const body = units.map(u => {
    const src = toCData(u.source)
    const tgt = targetLang ? `\n      <target state="translated">${toCData(u.target)}</target>` : ''
    return `    <trans-unit id="${u.path}" resname="${u.elementName || ''}" approved="yes">
      <source xml:space="preserve">${src}</source>${tgt}
    </trans-unit>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<xliff version="1.2">\n  <file ${fileAttrs}>\n    <body>\n${body}\n    </body>\n  </file>\n</xliff>\n`
}

function collectMultilingualNodes(obj, currentPath = '', elementName = '', out = []) {
  if (obj == null) return out
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      const p = currentPath ? `${currentPath}[${idx}]` : `[${idx}]`
      const nextName = (item && typeof item === 'object' && item.name) ? item.name : elementName
      collectMultilingualNodes(item, p, nextName, out)
    })
    return out
  }
  if (typeof obj !== 'object') return out

  const keys = Object.keys(obj)
  const hasLangs = keys.some(k => isLanguageKey(k))
  if (hasLangs) {
    out.push({ path: currentPath, elementName, value: obj })
    return out
  }

  for (const [k, v] of Object.entries(obj)) {
    const p = currentPath ? `${currentPath}.${k}` : k
    let nextName = elementName
    if (k === 'name' && typeof v === 'string') nextName = v
    collectMultilingualNodes(v, p, nextName, out)
  }
  return out
}

function pickSourceText(value) {
  const cand = value['en-US'] ?? value['en'] ?? value['default']
  if (cand != null) return String(cand)
  // fallback to first string value
  for (const v of Object.values(value)) {
    if (typeof v === 'string' && v.length) return v
  }
  return ''
}

function exportForJson(jsonPath) {
  const surveyName = path.basename(jsonPath, '.json')
  const survey = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  const nodes = collectMultilingualNodes(survey)

  // discover languages
  const langSet = new Set()
  nodes.forEach(n => {
    for (const k of Object.keys(n.value)) {
      if (isLanguageKey(k)) langSet.add(normalizeLangKey(k))
    }
  })
  langSet.delete('default')
  const targetLangs = Array.from(langSet).filter(l => l !== SOURCE_LANG)

  const units = nodes.map(n => ({
    path: n.path,
    elementName: n.elementName,
    source: pickSourceText(n.value)
  }))

  const outDir = path.join(OUT_DIR, surveyName)
  ensureDir(outDir)

  const sourceX = buildXLIFF({ surveyName, units, sourceLang: SOURCE_LANG })
  const sourceOut = path.join(outDir, `${surveyName}-source-${SOURCE_LANG}.xliff`)
  fs.writeFileSync(sourceOut, sourceX, 'utf8')
  console.log(`✅ Wrote ${sourceOut}`)

  for (const lang of targetLangs) {
    const langUnits = nodes.map(n => ({
      path: n.path,
      elementName: n.elementName,
      source: pickSourceText(n.value),
      target: String(n.value[lang] ?? '')
    }))
    const xliff = buildXLIFF({ surveyName, units: langUnits, sourceLang: SOURCE_LANG, targetLang: lang })
    const outPath = path.join(outDir, `${surveyName}-${lang}.xliff`)
    fs.writeFileSync(outPath, xliff, 'utf8')
    console.log(`✅ Wrote ${outPath}`)
  }
}

function main() {
  ensureDir(OUT_DIR)
  if (isAll) {
    const files = fs.readdirSync(SURVEYS_DIR).filter(f => f.endsWith('.json'))
    for (const f of files) exportForJson(path.join(SURVEYS_DIR, f))
    return
  }
  if (!srcArg) {
    console.log('Usage: node scripts/export-xliff-from-json.js <survey.json> [--source-lang en-US] | --all')
    process.exit(1)
  }
  const jsonPath = path.isAbsolute(srcArg) ? srcArg : path.resolve(process.cwd(), srcArg)
  exportForJson(jsonPath)
}

main()
