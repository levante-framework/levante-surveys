#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

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

function visit(node) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach(visit); return }
  if (node.name === 'SchoolHappy' && node.title && typeof node.title === 'object') {
    const t = node.title
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
  for (const k of Object.keys(node)) visit(node[k])
}

visit(json)

if (changed) {
  fs.writeFileSync(target, JSON.stringify(json, null, 2), 'utf8')
  console.log(`✅ Forced patch applied → ${path.relative(process.cwd(), target)}`)
} else {
  console.log('ℹ️ No changes needed')
}


