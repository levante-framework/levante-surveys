#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const surveysDir = path.join(projectRoot, 'surveys')
const backupsDir = path.join(surveysDir, 'backups')

function ensureBackupsDirExists() {
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true })
}

function getBaseNameForBackup(originalFilePath) {
  const rel = path.relative(surveysDir, originalFilePath)
  // Flatten any nested paths by replacing path separators with '__'
  return rel.split(path.sep).join('__')
}

export function writeBackup(originalFilePath) {
  ensureBackupsDirExists()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19)
  const baseName = getBaseNameForBackup(originalFilePath)
  const backupName = `${baseName}.backup.${timestamp}`
  const dest = path.join(backupsDir, backupName)
  fs.copyFileSync(originalFilePath, dest)
  return dest
}

export function pruneBackups(originalFilePath, keep = 3) {
  ensureBackupsDirExists()
  const baseName = getBaseNameForBackup(originalFilePath)
  const files = fs.readdirSync(backupsDir)
    .filter(f => f.startsWith(baseName + '.backup.'))
    .sort((a, b) => b.localeCompare(a))
  if (files.length <= keep) return []
  const toDelete = files.slice(keep)
  for (const f of toDelete) {
    try {
      fs.unlinkSync(path.join(backupsDir, f))
    } catch {}
  }
  return toDelete.map(f => path.join(backupsDir, f))
}

export function backupAndPrune(originalFilePath, keep = 3) {
  const dest = writeBackup(originalFilePath)
  const deleted = pruneBackups(originalFilePath, keep)
  return { backupPath: dest, pruned: deleted }
}


