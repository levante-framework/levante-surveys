#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

const targets = [
  'surveys/child_survey.json',
  'surveys/child_survey_updated.json'
]

function containsColegio(json) {
  const text = JSON.stringify(json)
  return /colegio/i.test(text)
}

let failures = 0
for (const t of targets) {
  if (!fs.existsSync(t)) continue
  const data = JSON.parse(fs.readFileSync(t, 'utf8'))
  if (!containsColegio(data)) {
    console.error(`❌ Missing expected 'colegio' anchor in ${t}`)
    failures++
  } else {
    console.log(`✅ colegio anchor present in ${t}`)
  }
}

if (failures > 0) process.exit(1)
console.log('🎉 Smoke test passed')
