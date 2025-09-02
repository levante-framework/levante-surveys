#!/usr/bin/env node

/**
 * Import translations from an XLIFF 1.2 file into a Survey JSON.
 * - Expects trans-unit id to be the JSON path to the multilingual object (e.g., pages[0].elements[1].title)
 * - Uses <file target-language> as the language code to set, normalized (hyphen with uppercase region)
 *
 * Usage:
 *   node scripts/import-xliff-into-json.js surveys/child_survey.json xliff-out/child_survey/child_survey-es-CO.xliff --out surveys/child_survey_updated.json
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const argv = process.argv.slice(2)
if (argv.length < 2) {
  console.log('Usage: node scripts/import-xliff-into-json.js <survey.json> <xliff-file> [--out <output.json>]')
  process.exit(1)
}

const surveyPath = path.isAbsolute(argv[0]) ? argv[0] : path.resolve(process.cwd(), argv[0])
const xliffPath = path.isAbsolute(argv[1]) ? argv[1] : path.resolve(process.cwd(), argv[1])
const outIdx = argv.indexOf('--out')
const outPath = outIdx !== -1 && argv[outIdx + 1] ? (path.isAbsolute(argv[outIdx + 1]) ? argv[outIdx + 1] : path.resolve(process.cwd(), argv[outIdx + 1])) : surveyPath.replace(/\.json$/, '_updated.json')

function normalizeLang(key) {
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

function parseXLIFF(content) {
  // Extract target-language
  const fileMatch = content.match(/<file[^>]*target-language="([^"]+)"[^>]*>/i)
  const targetLanguage = fileMatch ? normalizeLang(fileMatch[1]) : null

  const units = []
  const re = /<trans-unit[^>]*id="([^"]+)"[^>]*>[\s\S]*?<target[^>]*>([\s\S]*?)<\/target>/gi
  let m
  while ((m = re.exec(content)) !== null) {
    const id = m[1]
    let target = m[2]
    // Strip CDATA
    target = target.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    units.push({ id, target })
  }
  return { targetLanguage, units }
}

function getByPath(root, pth) {
  // tokens: word or [index]
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

function main() {
  const survey = JSON.parse(fs.readFileSync(surveyPath, 'utf8'))
  const xliffContent = fs.readFileSync(xliffPath, 'utf8')
  const { targetLanguage, units } = parseXLIFF(xliffContent)
  if (!targetLanguage) {
    console.error('❌ Could not determine target-language from XLIFF <file> tag')
    process.exit(1)
  }

  let applied = 0
  for (const u of units) {
    const node = getByPath(survey, u.id)
    if (node && typeof node === 'object') {
      node[targetLanguage] = u.target
      applied++
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(survey, null, 2), 'utf8')
  console.log(`✅ Applied ${applied} translations for ${targetLanguage}`)
  console.log(`💾 Wrote ${path.relative(projectRoot, outPath)}`)
}

main()
