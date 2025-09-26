#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const target = path.resolve('surveys/child_survey_updated.json')
if (!fs.existsSync(target)) {
  console.error(`❌ Not found: ${target}`)
  process.exit(1)
}

const json = JSON.parse(fs.readFileSync(target, 'utf8'))
let changed = false

function set(obj, key, val) {
  if (obj[key] !== val) {
    obj[key] = val
    changed = true
  }
}

for (const page of Array.isArray(json.pages) ? json.pages : []) {
  for (const el of Array.isArray(page.elements) ? page.elements : []) {
    if (el && el.name === 'SchoolHappy' && el.title && typeof el.title === 'object') {
      const t = el.title
      set(t, 'default', 'Are you happy at school?')
      set(t, 'en', 'Are you happy at school?')
      set(t, 'en-US', 'Are you happy at school?')
      set(t, 'en-GH', 'Are you happy at school?')
      set(t, 'es-CO', '¿Te sientes feliz en la escuela?')
      set(t, 'es-AR', '¿Te sientes feliz en la escuela?')
      set(t, 'de', 'Bist du glücklich in der Schule?')
      set(t, 'de-CH', 'Bist du glücklich in der Schule?')
      set(t, 'fr', "Êtes-vous heureux à l'école ?")
      set(t, 'fr-CA', "Êtes-vous heureux à l'école ?")
      set(t, 'nl', 'Ben je blij op school?')
    }
  }
}

if (changed) {
  fs.writeFileSync(target, JSON.stringify(json, null, 2), 'utf8')
  console.log(`✅ Patched SchoolHappy.title → ${path.relative(process.cwd(), target)}`)
} else {
  console.log('ℹ️ No changes needed')
}


