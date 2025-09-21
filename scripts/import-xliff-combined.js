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
    const srcLangMatch = block.match(/\bsource-language="([^"]+)"/i)
    const sourceLanguage = normalizeLang(srcLangMatch ? srcLangMatch[1] : null)

    const units = []
    const unitRe = /<trans-unit\b([^>]*)>([\s\S]*?)<\/trans-unit>/gi
    let u
    while ((u = unitRe.exec(block)) !== null) {
      const attrs = u[1] || ''
      const inner = u[2] || ''
      const idMatch = attrs.match(/\bid="([^"]+)"/i)
      const resnameMatch = attrs.match(/\bresname="([^"]*)"/i)
      const unitId = idMatch ? idMatch[1] : null
      const resname = resnameMatch ? resnameMatch[1] : null
      // target and source content
      const targetMatch = inner.match(/<target[^>]*>([\s\S]*?)<\/target>/i)
      let target = targetMatch ? targetMatch[1] : ''
      target = target.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      // also capture target attributes to read state
      const targetAttrMatch = inner.match(/<target\b([^>]*)>/i)
      const targetAttrs = targetAttrMatch ? targetAttrMatch[1] : ''
      const targetStateMatch = targetAttrs.match(/\bstate\s*=\s*"([^"]+)"/i)
      const targetState = targetStateMatch ? targetStateMatch[1] : ''
      const sourceMatch = inner.match(/<source[^>]*>([\s\S]*?)<\/source>/i)
      let source = sourceMatch ? sourceMatch[1] : ''
      source = source.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      // context: try to extract survey hint from context-group source
      let surveyHint = null
      // Gather all <context> text and search for any *.json hint (handles item bank files)
      const ctxAll = [...inner.matchAll(/<context[^>]*>([\s\S]*?)<\/context>/gi)]
      if (ctxAll.length > 0) {
        for (const m2 of ctxAll) {
          const ctxText = (m2[1] || '').toString()
          const jsonMatch = ctxText.match(/([A-Za-z0-9_\-]+\.json)/)
          if (jsonMatch) {
            surveyHint = path.basename(jsonMatch[1])
            break
          }
        }
      }
      units.push({ id: unitId, resname, target, source, surveyHint, targetState })
    }

    files.push({ original, targetLanguage, sourceLanguage, units })
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

function applyToSurvey({ surveyJsonPath, targetLanguage, sourceLanguage, units, outPath }) {
  // Accumulate: if an updated file already exists, start from it; otherwise, start from base JSON
  const surveyPathToRead = (outPath && fs.existsSync(outPath)) ? outPath : surveyJsonPath
  const survey = JSON.parse(fs.readFileSync(surveyPathToRead, 'utf8'))
  const normalized = normalizeDefaultsFromValues(survey)
  if (normalized > 0) {
    console.log(`🔧 Normalized ${normalized} items missing text.default before import in ${path.basename(surveyPathToRead)}`)
  }

  // Build a map of semantic ids (like page1.q.foo.title) -> node reference
  const idToNode = new Map()
  collectMultilingualNodes(survey).forEach(n => {
    idToNode.set(n.id, n.value)
  })

  let applied = 0

  // Decode entities helper
  function decodeEntities(input) {
    if (input == null) return ''
    let t = String(input)
    t = t
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    return t
  }

  // Normalize text; preserve raw content (only decode/trim)
  function normalizeText(input, { isHtml }) {
    if (input == null) return ''
    let t = decodeEntities(input)
    return String(t).trim()
  }

  function isHtmlId(id) {
    return typeof id === 'string' && id.toLowerCase().includes('.html')
  }

  for (const u of units) {
    let node = null
    if (u.resname) {
      let key = u.resname
      if (!idToNode.has(key) && idToNode.has(key + '.value')) key = key + '.value'
      if (idToNode.has(key)) {
        node = idToNode.get(key)
      }
    } else if (u.id && idToNode.has(u.id)) {
      node = idToNode.get(u.id)
    } else if (u.id) {
      node = getByPath(survey, u.id)
    }
    if (node && typeof node === 'object') {
      // Simple rule: use non-empty <target>. If missing and en-US with needs-translation, use <source>
      const isEnUS = targetLanguage === 'en-US'
      const needsTranslation = typeof u.targetState === 'string' && /needs-translation/i.test(u.targetState)
      let candidate = (u.target || '').trim()
      if (!candidate && isEnUS && needsTranslation) {
        candidate = (u.source || '').trim()
      }
      if (!candidate) continue
      const isHtml = (u.resname && isHtmlId(u.resname)) || (u.id && isHtmlId(u.id))
      const value = normalizeText(candidate, { isHtml })
      if (!value) continue
      // Write only the computed language
      node[targetLanguage] = value
      // If we used en-US fallback due to needs-translation, also seed base en/default
      if (isEnUS && needsTranslation) {
        if (!node['en'] || String(node['en']).trim() === '') node['en'] = value
        if (!node['default'] || String(node['default']).trim() === '') node['default'] = value
      }
      applied++
    } else {
      // Disable heuristic token matching to avoid unintended overwrites
      if (true) { continue }
      // Heuristic mapping disabled
    }
  }

  // Final pass disabled to avoid clearing English values unexpectedly
  const resnameSource = new Map()

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
  // If it's pointing to an Excel-derived item bank filename, skip fallback
  if (/item-bank/i.test(base) || /\.xlsx$/i.test(base)) return null
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

  // Derive implied locale from the input filename, e.g., en-US-surveys.xliff or item-bank-translations-en-US.xliff
  const baseName = path.basename(inPath)
  let impliedLang = null
  {
    const m = baseName.match(/(?:^|[^a-zA-Z])(en-US|en-GH|de-CH|de-DE|es-AR|es-CO|fr-CA|nl-NL)(?:[^a-zA-Z]|$)/i)
    if (m) impliedLang = normalizeLang(m[1])
  }
  // If block target-language is missing or too generic (e.g., 'en'), prefer impliedLang
  for (const f of files) {
    if (!f.targetLanguage || /^en$/i.test(f.targetLanguage)) {
      if (impliedLang) f.targetLanguage = impliedLang
    }
  }

  for (const f of files) {
    // Group units by survey json inferred from unit context, fallback to file original
    const groups = new Map()
    const knownSurveyJsons = [
      path.join(surveysDir, 'child_survey.json'),
      path.join(surveysDir, 'parent_survey_family.json'),
      path.join(surveysDir, 'parent_survey_child.json'),
      path.join(surveysDir, 'teacher_survey_general.json'),
      path.join(surveysDir, 'teacher_survey_classroom.json')
    ]
    for (const u of f.units) {
      let jsonPath = null
      if (u.surveyHint) {
        jsonPath = path.join(surveysDir, u.surveyHint)
      } else {
        jsonPath = surveyJsonForOriginal(f.original)
      }
      if (jsonPath) {
        const arr = groups.get(jsonPath) || []
        arr.push(u)
        groups.set(jsonPath, arr)
      } else {
        // Unknown target survey: try all known surveys (only correct ones will match nodes)
        for (const kp of knownSurveyJsons) {
          const arr = groups.get(kp) || []
          arr.push(u)
          groups.set(kp, arr)
        }
      }
    }

    for (const [jsonPath, unitList] of groups.entries()) {
      if (!fs.existsSync(jsonPath)) {
        console.warn(`⚠️  Skipping group: JSON not found ${jsonPath}`)
        continue
      }
      const base = path.basename(jsonPath, '.json')
      const outPath = inplace ? jsonPath : path.join(outDir, `${base}_updated.json`)
      applyToSurvey({ surveyJsonPath: jsonPath, targetLanguage: f.targetLanguage, sourceLanguage: f.sourceLanguage, units: unitList, outPath })
    }
  }
}

main()


