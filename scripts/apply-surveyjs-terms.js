#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const surveysDir = path.join(projectRoot, 'surveys')

// Map Crowdin locales to our JSON keys
function normalizeLocale(l) {
  if (l === 'en') return 'en'
  if (l.includes('_')) {
    const [a, b] = l.split('_'); return `${a}-${b.toUpperCase()}`
  }
  if (/^[a-z]{2}-[a-z]{2}$/i.test(l)) {
    const [a,b] = l.split('-'); return `${a}-${b.toUpperCase()}`
  }
  return l
}

function readSurveyjsTerms() {
  // Prefer Crowdin outputs in main/surveys, then fall back to xliff-out exports
  const xliffOutDir = path.join(projectRoot, 'xliff-out', 'surveyjs')
  const mainSurveysDir = path.join(projectRoot, 'main', 'surveys')
  const base = {}
  // Seed from fixes/surveyjs.json if present
  const seedPath = path.join(projectRoot, 'fixes', 'surveyjs.json')
  if (fs.existsSync(seedPath)) {
    try {
      const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
      for (const key of Object.keys(seed)) base[key] = { ...seed[key] }
    } catch (_) {}
  }

  // Baseline from a known-good survey (child) to retain high-quality translations
  const knownGoodPaths = [
    path.join(projectRoot, 'surveys', 'child_survey.json'),
    path.join(projectRoot, 'surveys', 'child_survey_updated.json')
  ]
  for (const goodPath of knownGoodPaths) {
    if (!fs.existsSync(goodPath)) continue
    try {
      const good = JSON.parse(fs.readFileSync(goodPath, 'utf8'))
      for (const key of Object.keys(base)) {
        if (good[key] && typeof good[key] === 'object') {
          for (const [lang, val] of Object.entries(good[key])) {
            const v = String(val || '').trim()
            if (!v) continue
            if (!base[key][lang] || String(base[key][lang]).trim() === '') {
              base[key][lang] = v
            }
          }
        }
      }
    } catch (_) {}
  }

  // Helper to process a directory of xliff files with a given filename pattern
  const keyToUnitId = {
    startsurveytext: 'startSurveyText',
    pageprevtext: 'pagePrevText',
    pagenexttext: 'pageNextText',
    completetext: 'completeText'
  }
  function processDir(dirPath, filenameRegex) {
    if (!fs.existsSync(dirPath)) return
    const files = fs.readdirSync(dirPath)
    for (const f of files) {
      const m = f.match(filenameRegex)
      if (!m) continue
      const locale = normalizeLocale(m[1])
      const content = fs.readFileSync(path.join(dirPath, f), 'utf8')
      const unitRe = /<trans-unit\b([^>]*)>([\s\S]*?)<\/trans-unit>/gi
      let um
      while ((um = unitRe.exec(content)) !== null) {
        const attrs = um[1] || ''
        const body = um[2] || ''
        const idMatch = attrs.match(/\bid="([^"]+)"/i)
        const id = (idMatch ? idMatch[1] : '').toLowerCase()
        const tgtMatch = body.match(/<target([^>]*)>([\s\S]*?)<\/target>/i)
        const tgtAttrs = tgtMatch ? tgtMatch[1] : ''
        const targetStateMatch = tgtAttrs.match(/\bstate\s*=\s*"([^"]+)"/i)
        const targetState = targetStateMatch ? String(targetStateMatch[1]).toLowerCase() : ''
        let raw = tgtMatch ? tgtMatch[2] : ''
        const text = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()
        const srcMatch = body.match(/<source[^>]*>([\s\S]*?)<\/source>/i)
        const srcText = (srcMatch ? srcMatch[1] : '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()
        const key = keyToUnitId[id]
        // Skip if target is empty, equals source, or marked needs-translation
        if (key && text && text !== srcText && targetState !== 'needs-translation') {
          if (!base[key]) base[key] = {}
          base[key][locale] = text
        }
      }
    }
  }

  // Load older exports first
  processDir(xliffOutDir, /^surveyjs-([A-Za-z-]+)\.xliff$/)
  // Then override with the latest from Crowdin main/surveys
  processDir(mainSurveysDir, /^surveyjs_([A-Za-z-]+)\.xliff$/)
  return base
}

function mergeTermsIntoSurvey(survey) {
  const terms = readSurveyjsTerms()
  const ALWAYS_OVERWRITE_KEYS = new Set(['startSurveyText', 'pagePrevText', 'pageNextText', 'completeText'])
  for (const key of Object.keys(terms)) {
    if (!survey[key] || typeof survey[key] !== 'object') survey[key] = {}
    const dest = survey[key]
    for (const [lang, val] of Object.entries(terms[key])) {
      if (val == null || String(val).trim() === '') continue
      // Never modify English baselines via this merge
      if (lang === 'default' || lang === 'en' || lang === 'en-US') continue
      if (ALWAYS_OVERWRITE_KEYS.has(key)) {
        dest[lang] = val
      } else {
        const current = dest[lang]
        const curStr = current == null ? '' : String(current).trim()
        const englishBase = String(dest['en-US'] || dest['en'] || dest['default'] || '').trim()
        // Protect existing non-empty translations that differ from English baseline
        if (curStr && englishBase && curStr !== englishBase) continue
        // Otherwise, set Crowdin-provided translation
        dest[lang] = val
      }
    }
  }
  return survey
}

function main() {
  const files = fs.readdirSync(surveysDir).filter(f => f.endsWith('.json'))
  for (const f of files) {
    const p = path.join(surveysDir, f)
    const isUpdated = /_updated\.json$/i.test(f)
    const targetPath = isUpdated ? p : p.replace(/\.json$/, '_updated.json')
    const sourcePath = fs.existsSync(targetPath) ? targetPath : p
    const json = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
    const merged = mergeTermsIntoSurvey(json)
    fs.writeFileSync(targetPath, JSON.stringify(merged, null, 2), 'utf8')
    console.log(`✅ Applied standard terms to ${path.basename(targetPath)}`)
  }
}

main()


