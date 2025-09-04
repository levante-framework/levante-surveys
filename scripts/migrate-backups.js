#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const surveysDir = path.join(projectRoot, 'surveys')
const backupsDir = path.join(surveysDir, 'backups')

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }) }

function parseBackupInfo(filename) {
  // example: child_survey.json.backup.1700000000000 or child_survey.json.backup.2024-09-01_12-30-00
  const match = filename.match(/^(.*\.json)\.backup\.(.+)$/)
  if (!match) return null
  const base = match[1]
  const ts = match[2]
  return { base, ts }
}

function migrate() {
  ensureDir(backupsDir)
  const entries = fs.readdirSync(surveysDir)
    .filter(f => f.endsWith('.backup') === false && f.includes('.backup.'))
    .filter(f => f.endsWith('.json') === false) // avoid copying live jsons
  const moved = []
  for (const f of entries) {
    const info = parseBackupInfo(f)
    if (!info) continue
    const src = path.join(surveysDir, f)
    const destName = f.replace(/[\\/]/g, '__')
    const dest = path.join(backupsDir, destName)
    try {
      fs.renameSync(src, dest)
      moved.push(dest)
    } catch {
      // If rename across devices fails, fallback to copy+unlink
      try { fs.copyFileSync(src, dest); fs.unlinkSync(src); moved.push(dest) } catch {}
    }
  }

  // prune: keep only 3 most recent per base
  const byBase = new Map()
  for (const f of fs.readdirSync(backupsDir)) {
    const info = parseBackupInfo(f.replace(/__+/g, '/')) || parseBackupInfo(f)
    if (!info) continue
    const baseKey = info.base
    if (!byBase.has(baseKey)) byBase.set(baseKey, [])
    byBase.get(baseKey).push(f)
  }
  let pruned = 0
  for (const [base, list] of byBase.entries()) {
    list.sort((a, b) => b.localeCompare(a))
    const extra = list.slice(3)
    for (const f of extra) {
      try { fs.unlinkSync(path.join(backupsDir, f)); pruned++ } catch {}
    }
  }

  console.log(`✅ Migration complete. Moved: ${moved.length}, Pruned: ${pruned}`)
}

migrate()


