#!/usr/bin/env node

/**
 * Import translations from a combined XLIFF 1.2 file (containing multiple <file> blocks)
 * into their corresponding Survey JSON files in the surveys/ directory.
 *
 * - Detects <file original="{survey}.json"> and <file target-language="...">
 * - Applies <trans-unit id> targets to the JSON node at that path
 * - Writes to surveys/{survey}_updated.json (in-place if --inplace)
 *
 * Usage:
 *   node scripts/import-xliff-combined.js <path/to/<locale>-surveys.xliff> [--surveys-dir surveys] [--out-dir surveys] [--inplace]
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { normalizeDefaultsFromValues } from './normalize-utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const argv = process.argv.slice(2)
if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
  console.log(`
📥 XLIFF Combined Importer

Usage:
  node scripts/import-xliff-combined.js <path/to/<locale>-surveys.xliff> [--surveys-dir surveys] [--out-dir surveys] [--inplace]

Options:
  --surveys-dir   Directory containing source JSON (default: surveys)
  --out-dir       Directory to write *_updated.json (default: surveys)
  --inplace       Overwrite original JSON files (no *_updated.json)
`)
  process.exit(0)
}

const inPathArg = argv.find(a => a && !a.startsWith('--'))
const inPath = path.isAbsolute(inPathArg) ? inPathArg : path.resolve(process.cwd(), inPathArg)
const surveysDir = path.resolve(process.cwd(), argv.includes('--surveys-dir') ? argv[argv.indexOf('--surveys-dir') + 1] : 'surveys')
const outDir = path.resolve(process.cwd(), argv.includes('--out-dir') ? argv[argv.indexOf('--out-dir') + 1] : 'surveys')
const inplace = argv.includes('--inplace')

function normalizeLang(key) {
  if (!key) return key
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

function parseCombinedXLIFF(content) {
  // Split by <file ...> ... </file>
  const files = []
  const fileRe = /<file\b[^>]*>[\s\S]*?<\/file>/gi
  let m
  while ((m = fileRe.exec(content)) !== null) {
    const block = m[0]
    const originalMatch = block.match(/\boriginal="([^"]+)"/i)
    const original = originalMatch ? originalMatch[1] : null
    const langMatch = block.match(/\btarget-language="([^"]+)"/i)
    const targetLanguage = normalizeLang(langMatch ? langMatch[1] : null)

    const units = []
    const unitRe = /<trans-unit\b([^>]*)>[\s\S]*?<target[^>]*>([\s\S]*?)<\/target>[\s\S]*?<\/trans-unit>/gi
    let u
    while ((u = unitRe.exec(block)) !== null) {
      const attrs = u[1] || ''
      const idMatch = attrs.match(/\bid="([^"]+)"/i)
      const resnameMatch = attrs.match(/\bresname="([^"]*)"/i)
      const unitId = idMatch ? idMatch[1] : null
      const resname = resnameMatch ? resnameMatch[1] : null
      let target = u[2]
      target = target.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      units.push({ id: unitId, resname, target })
    }

    files.push({ original, targetLanguage, units })
  }
  return files
}

function getByPath(root, pth) {
  const tokens = []
  const re = /(\w+)|(\[(\d+)\])/g
  let m
  while ((m = re.exec(pth)) !== null) {
    if (m[1]) tokens.push(m[1])
    else if (m[3]) tokens.push(Number(m[3]))
  }
  let cur = root
  for (const tk of tokens) {
    if (cur == null) return null
    cur = cur[tk]
  }
  return cur
}

function applyToSurvey({ surveyJsonPath, targetLanguage, units, outPath }) {
  const survey = JSON.parse(fs.readFileSync(surveyJsonPath, 'utf8'))
  const normalized = normalizeDefaultsFromValues(survey)
  if (normalized > 0) {
    console.log(`🔧 Normalized ${normalized} items missing text.default before import in ${path.basename(surveyJsonPath)}`)
  }

  // Build a map of semantic ids (like page1.q.foo.title) -> node reference
  const idToNode = new Map()
  collectMultilingualNodes(survey).forEach(n => {
    idToNode.set(n.id, n.value)
  })

  let applied = 0
  for (const u of units) {
    let node = null
    if (u.resname && idToNode.has(u.resname)) {
      node = idToNode.get(u.resname)
    } else if (u.id && idToNode.has(u.id)) {
      node = idToNode.get(u.id)
    } else if (u.id) {
      node = getByPath(survey, u.id)
    }
    if (node && typeof node === 'object') {
      let value = u.target
      // If this is an HTML field, normalize multi-paragraph text to HTML line breaks
      const isHtmlField = (u.resname && u.resname.endsWith('.html')) || (u.id && u.id.endsWith('.html'))
      if (isHtmlField) {
        value = normalizeParagraphsToHtml(value)
        // Carry forward leading HTML opener tags from baseline if target lacks them
        const baseline = node['default'] || node['en-US'] || node['en'] || ''
        const openerMatch = String(baseline).match(/^((?:<[^>]+>)+)/)
        if (openerMatch) {
          const opener = openerMatch[1]
          const trimmed = value.trim()
          if (!/^</.test(trimmed)) {
            value = `${opener} ${trimmed}`
          }
        }
      }
      node[targetLanguage] = value
      applied++
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(survey, null, 2), 'utf8')
  console.log(`✅ ${path.basename(surveyJsonPath)}: Applied ${applied} translations for ${targetLanguage} → ${path.relative(projectRoot, outPath)}`)
}

function surveyJsonForOriginal(originalAttr) {
  // original may be like:
  //  "/surveys/parent_survey_child-source.xliff"
  //  "/surveys/child_survey-en-US.xliff"
  //  "child_survey.json"
  if (!originalAttr) return null
  const base = path.basename(String(originalAttr).trim())
  // Strip extension
  const noExt = base.replace(/\.xliff$/i, '').replace(/\.json$/i, '')
  // Remove trailing -source or -<lang>
  const surveyName = noExt.replace(/-(source|[a-z]{2}(?:-[A-Z]{2})?)$/i, '')
  const jsonFile = `${surveyName}.json`
  return path.join(surveysDir, jsonFile)
}

// ---- Helpers to build semantic ids matching exporter ----
function isLanguageKey(key) {
  return key === 'default' || /^[a-z]{2}(-[A-Z]{2})?$/i.test(key) || /^[a-z]{2}_[a-z]{2}$/i.test(key)
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

function collectMultilingualNodes(obj, { currentPath = '', semantic = [], parentKey = '', out = [] } = {}) {
  if (obj == null) return out
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      let part = null
      const hasName = item && typeof item === 'object' && typeof item.name === 'string' && item.name.trim() !== ''
      const hasValue = item && typeof item === 'object' && (typeof item.value === 'string' || typeof item.value === 'number')
      if (parentKey === 'pages') part = slugify(hasName ? item.name : `#${idx}`)
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
    const leaf = parentKey ? slugify(parentKey) : 'value'
    const id = semantic.concat(leaf).join('.')
    out.push({ id, value: obj })
    return out
  }

  for (const [k, v] of Object.entries(obj)) {
    const p = currentPath ? `${currentPath}.${k}` : k
    if (k === 'pages' || k === 'elements' || k === 'choices' || k === 'rows' || k === 'columns') {
      collectMultilingualNodes(v, { currentPath: p, semantic, parentKey: k, out })
      continue
    }
    let nextSemantic = semantic
    if (k === 'name' && typeof v === 'string' && v.trim() !== '') {
      if (nextSemantic.length > 0) {
        const last = nextSemantic[nextSemantic.length - 1]
        const [kind] = last.split('.')
        nextSemantic = nextSemantic.slice(0, -1).concat(seg(kind, v))
      }
      collectMultilingualNodes(v, { currentPath: p, semantic: nextSemantic, parentKey: k, out })
      continue
    }
    collectMultilingualNodes(v, { currentPath: p, semantic: nextSemantic, parentKey: k, out })
  }
  return out
}

function normalizeParagraphsToHtml(text) {
  if (text == null) return ''
  // Normalize line endings
  let t = String(text).replace(/\r\n/g, '\n')
  // Trim outer whitespace
  t = t.trim()
  // Replace double+ newlines with <br><br> to separate paragraphs
  t = t.replace(/\n{2,}/g, '<br><br>')
  // Replace remaining single newlines with spaces
  t = t.replace(/\n/g, ' ')
  return t
}

function main() {
  if (!fs.existsSync(inPath)) {
    console.error(`❌ XLIFF not found: ${inPath}`)
    process.exit(1)
  }

  const content = fs.readFileSync(inPath, 'utf8')
  const files = parseCombinedXLIFF(content)
  if (files.length === 0) {
    console.error('❌ No <file> entries found in XLIFF')
    process.exit(1)
  }

  for (const f of files) {
    const jsonPath = surveyJsonForOriginal(f.original)
    if (!jsonPath || !fs.existsSync(jsonPath)) {
      console.warn(`⚠️  Skipping: could not resolve survey JSON for original="${f.original}"`)
      continue
    }
    const base = path.basename(jsonPath, '.json')
    const outPath = inplace ? jsonPath : path.join(outDir, `${base}_updated.json`)
    applyToSurvey({ surveyJsonPath: jsonPath, targetLanguage: f.targetLanguage, units: f.units, outPath })
  }
}

main()


