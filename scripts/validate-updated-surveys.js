#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const surveysDir = path.join(projectRoot, 'surveys')

const SURVEY_JSON_FILES = [
  'child_survey_updated.json',
  'parent_survey_family_updated.json',
  'parent_survey_child_updated.json',
  'teacher_survey_general_updated.json',
  'teacher_survey_classroom_updated.json'
]

function isLangKey(key) {
  return key === 'default' || /^[a-z]{2}(-[A-Z]{2})?$/i.test(key)
}

function* iterObjects(node) {
  if (node && typeof node === 'object') {
    yield node
    if (Array.isArray(node)) {
      for (const item of node) yield* iterObjects(item)
    } else {
      for (const v of Object.values(node)) yield* iterObjects(v)
    }
  }
}

function hasHtmlTag(s) {
  return typeof s === 'string' && /<[^>]+>/.test(s)
}

function validateFile(filePath) {
  const issues = []
  const raw = fs.readFileSync(filePath, 'utf8')
  const json = JSON.parse(raw)

  for (const obj of iterObjects(json)) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue
    const keys = Object.keys(obj)
    const hasLangs = keys.some(isLangKey)
    if (!hasLangs) continue

    // HTML tag check across all language values
    for (const [k, v] of Object.entries(obj)) {
      if (!isLangKey(k) || typeof v !== 'string') continue
      if (hasHtmlTag(v)) {
        issues.push({ type: 'html', key: k, value: v.slice(0, 120) + (v.length > 120 ? '…' : '') })
      }
    }

    // English/default non-empty check
    const def = typeof obj.default === 'string' ? obj.default.trim() : ''
    const en = typeof obj.en === 'string' ? obj.en.trim() : ''
    const enUS = typeof obj['en-US'] === 'string' ? obj['en-US'].trim() : ''
    if (def === '' && en === '' && enUS === '') {
      issues.push({ type: 'empty_en', keys: ['default', 'en', 'en-US'] })
    }
  }

  return issues
}

function main() {
  let totalIssues = 0
  for (const f of SURVEY_JSON_FILES) {
    const p = path.join(surveysDir, f)
    if (!fs.existsSync(p)) {
      console.warn(`⚠️  Missing file: ${f}`)
      continue
    }
    const issues = validateFile(p)
    if (issues.length > 0) {
      totalIssues += issues.length
      console.log(`❌ ${f}: ${issues.length} issues`)
      const byType = issues.reduce((acc, it) => { acc[it.type] = (acc[it.type] || 0) + 1; return acc }, {})
      console.log('   Breakdown:', byType)
    } else {
      console.log(`✅ ${f}: OK`)
    }
  }
  if (totalIssues > 0) {
    console.error(`\n❌ Validation failed: ${totalIssues} total issues`)
    process.exit(1)
  }
  console.log('\n✅ Validation passed')
}

main()






