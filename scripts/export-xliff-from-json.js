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
import { normalizeDefaultsFromValues } from './normalize-utils.js'

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
    return `    <trans-unit id="${u.id}" resname="${u.resname || ''}" approved="yes">
      <source xml:space="preserve">${src}</source>${tgt}
    </trans-unit>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<xliff version="1.2">\n  <file ${fileAttrs}>\n    <body>\n${body}\n    </body>\n  </file>\n</xliff>\n`
}

function slugify(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
}

function seg(kind, value) {
  const v = slugify(value != null && value !== '' ? value : 'unnamed')
  return `${kind}.${v}`
}

/**
 * Collect nodes that are localization objects and build human-meaningful ids.
 * Id composition rules (examples):
 * - pages.my_page.elements.q_attendance.title
 * - elements.q_behavior.choices.choice_yes.text
 * - matrix.q_matrix.rows.row_low.text
 */
function collectMultilingualNodes(obj, { currentPath = '', semantic = [], parentKey = '', out = [] } = {}) {
  if (obj == null) return out
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      let part = null
      // Prefer named segments
      const hasName = item && typeof item === 'object' && typeof item.name === 'string' && item.name.trim() !== ''
      const hasValue = item && typeof item === 'object' && (typeof item.value === 'string' || typeof item.value === 'number')
      if (parentKey === 'pages') {
        // Do NOT prefix with 'page.' per spec; just use the page name slug
        part = slugify(hasName ? item.name : `#${idx}`)
      }
      else if (parentKey === 'elements') part = seg('q', hasName ? item.name : `#${idx}`)
      else if (parentKey === 'choices') part = seg('choice', hasValue ? String(item.value) : hasName ? item.name : `#${idx}`)
      else if (parentKey === 'rows') part = seg('row', hasValue ? String(item.value) : hasName ? item.name : `#${idx}`)
      else if (parentKey === 'columns') part = seg('col', hasValue ? String(item.value) : hasName ? item.name : `#${idx}`)
      else part = seg(parentKey || 'item', hasName ? item.name : (hasValue ? String(item.value) : `#${idx}`))

      const p = currentPath ? `${currentPath}[${idx}]` : `[${idx}]`
      const nextSemantic = semantic.concat(part)
      collectMultilingualNodes(item, { currentPath: p, semantic: nextSemantic, parentKey, out })
    })
    return out
  }
  if (typeof obj !== 'object') return out

  const keys = Object.keys(obj)
  const hasLangs = keys.some(k => isLanguageKey(k))
  if (hasLangs) {
    // Determine leaf key name from parentKey
    const leaf = parentKey ? slugify(parentKey) : 'value'
    const id = semantic.concat(leaf).join('.')
    // Prefer a human-readable resname from closest question name if present
    const resname = semantic.find(s => s.startsWith('q.')) || semantic[semantic.length - 1] || ''
    out.push({ id, resname, path: currentPath, value: obj, semantic: [...semantic], leaf })
    return out
  }

  for (const [k, v] of Object.entries(obj)) {
    const p = currentPath ? `${currentPath}.${k}` : k
    // Extend semantic path based on structural keys
    let nextSemantic = semantic
    if (k === 'pages' || k === 'elements' || k === 'choices' || k === 'rows' || k === 'columns') {
      // Arrays handled in recursive call above with parentKey guidance
      collectMultilingualNodes(v, { currentPath: p, semantic, parentKey: k, out })
      continue
    }
    if (k === 'name' && typeof v === 'string' && v.trim() !== '') {
      // Update the last structural segment's name if possible
      if (nextSemantic.length > 0) {
        const last = nextSemantic[nextSemantic.length - 1]
        const [kind] = last.split('.')
        nextSemantic = nextSemantic.slice(0, -1).concat(seg(kind, v))
      }
      collectMultilingualNodes(v, { currentPath: p, semantic: nextSemantic, parentKey: k, out })
      continue
    }
    // For other keys, just traverse; when/if v is a localization object, parentKey=k will be used as leaf
    collectMultilingualNodes(v, { currentPath: p, semantic: nextSemantic, parentKey: k, out })
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
  // Normalize missing text.default from value before exporting
  const updated = normalizeDefaultsFromValues(survey)
  if (updated > 0) {
    console.log(`🔧 Normalized ${updated} items missing text.default in ${surveyName}`)
  }
  const nodes = collectMultilingualNodes(survey)

  // Seed en-US where missing using fallback chain: en -> default -> value/name from path
  for (const n of nodes) {
    const v = n.value
    const hasEnUS = Object.prototype.hasOwnProperty.call(v, 'en-US')
    if (!hasEnUS) {
      if (v.en != null && v.en !== '') {
        v['en-US'] = String(v.en)
      } else if (v.default != null && v.default !== '') {
        v['en-US'] = String(v.default)
      } else {
        // Derive from semantic path: prefer choice.<val>, else q.<name>, else last segment
        let fallback = ''
        const choiceSeg = (n.semantic || []).find(s => s.startsWith('choice.'))
        if (choiceSeg) fallback = choiceSeg.split('.').slice(1).join('.')
        if (!fallback) {
          const qSeg = (n.semantic || []).find(s => s.startsWith('q.'))
          if (qSeg) fallback = qSeg.split('.').slice(1).join('.')
        }
        if (!fallback) fallback = (n.semantic || [])[ (n.semantic || []).length - 1 ] || n.leaf || 'value'
        v['en-US'] = String(fallback)
      }
    }
  }

  // discover languages
  const langSet = new Set()
  nodes.forEach(n => {
    for (const k of Object.keys(n.value)) {
      if (isLanguageKey(k)) langSet.add(normalizeLangKey(k))
    }
  })
  langSet.delete('default')
  const discoveredTargetLangs = Array.from(langSet).filter(l => l !== SOURCE_LANG)
  // Always include SOURCE_LANG (en-US) as a target so Crowdin shows values for that locale
  const targetLangs = Array.from(new Set([...discoveredTargetLangs, SOURCE_LANG]))

  const units = nodes.map(n => ({
    id: n.id,
    resname: n.resname,
    source: pickSourceText(n.value)
  }))

  const outDir = path.join(OUT_DIR, surveyName)
  ensureDir(outDir)

  const sourceX = buildXLIFF({ surveyName, units, sourceLang: SOURCE_LANG })
  const sourceOut = path.join(outDir, `${surveyName}-source.xliff`)
  fs.writeFileSync(sourceOut, sourceX, 'utf8')
  console.log(`✅ Wrote ${sourceOut}`)

  for (const lang of targetLangs) {
    const langUnits = nodes.map(n => ({
      id: n.id,
      resname: n.resname,
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
    const files = fs
      .readdirSync(SURVEYS_DIR)
      .filter(f => f.endsWith('.json') && !f.endsWith('_updated.json'))
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
