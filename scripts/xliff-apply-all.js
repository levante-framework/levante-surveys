#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

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

function parseXLIFF(content) {
  const fileMatch = content.match(/<file[^>]*target-language="([^"]+)"[^>]*>/i)
  const targetLanguage = fileMatch ? normalizeLang(fileMatch[1]) : null
  const units = []
  const re = /<trans-unit[^>]*id="([^"]+)"[^>]*>[\s\S]*?(?:<target[^>]*>([\s\S]*?)<\/target>)?[\s\S]*?<\/trans-unit>/gi
  let m
  while ((m = re.exec(content)) !== null) {
    const id = m[1]
    let target = (m[2] || '')
    target = target.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    units.push({ id, target })
  }
  return { targetLanguage, units }
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

function ensureOutFileName(jsonPath) {
  const dir = path.dirname(jsonPath)
  const base = path.basename(jsonPath, '.json')
  return path.join(dir, `${base}_updated.json`)
}

function main() {
  const surveyJsonArg = process.argv[2]
  if (!surveyJsonArg) {
    console.log('Usage: node scripts/xliff-apply-all.js <surveys/<survey>.json>')
    process.exit(1)
  }
  const surveyJsonPath = path.isAbsolute(surveyJsonArg) ? surveyJsonArg : path.resolve(projectRoot, surveyJsonArg)
  if (!fs.existsSync(surveyJsonPath)) {
    console.error(`❌ Survey JSON not found: ${surveyJsonPath}`)
    process.exit(1)
  }
  const surveyName = path.basename(surveyJsonPath, '.json')
  const xliffDir = path.resolve(projectRoot, 'xliff-out', surveyName)
  if (!fs.existsSync(xliffDir)) {
    console.error(`❌ XLIFF directory not found: ${xliffDir}`)
    process.exit(1)
  }

  const files = fs.readdirSync(xliffDir).filter(f => f.endsWith('.xliff'))
  const targetFiles = files.filter(f => !/-source-/i.test(f))

  let survey = JSON.parse(fs.readFileSync(surveyJsonPath, 'utf8'))
  const appliedPerLang = {}

  for (const f of targetFiles) {
    const full = path.join(xliffDir, f)
    const content = fs.readFileSync(full, 'utf8')
    const { targetLanguage, units } = parseXLIFF(content)
    if (!targetLanguage) {
      console.warn(`⚠️  Skipping (no target-language): ${f}`)
      continue
    }
    if (targetLanguage === 'es') {
      console.log(`↪️  Skipping base 'es' in ${f}`)
      continue
    }
    let applied = 0
    for (const u of units) {
      if (!u.target) continue
      const node = getByPath(survey, u.id)
      if (node && typeof node === 'object') {
        node[targetLanguage] = u.target
        applied++
      }
    }
    appliedPerLang[targetLanguage] = (appliedPerLang[targetLanguage] || 0) + applied
    console.log(`✅ ${f}: applied ${applied} strings for ${targetLanguage}`)
  }

  const outPath = ensureOutFileName(surveyJsonPath)
  fs.writeFileSync(outPath, JSON.stringify(survey, null, 2), 'utf8')
  console.log(`💾 Wrote ${path.relative(projectRoot, outPath)}`)
  console.log('📊 Applied per language:', appliedPerLang)
}

main()
