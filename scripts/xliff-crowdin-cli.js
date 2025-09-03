#!/usr/bin/env node

import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import axios from 'axios'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

async function resolveToken() {
  const envToken = process.env.CROWDIN_API_TOKEN || process.env.CROWDIN_TOKEN || process.env.CROWDIN_PERSONAL_TOKEN
  if (envToken) return envToken.trim()
  const homeTokenPath = path.join(os.homedir(), '.crowdin_api_token')
  if (fs.existsSync(homeTokenPath)) {
    return fs.readFileSync(homeTokenPath, 'utf8').trim()
  }
  const homeYml = path.join(os.homedir(), '.crowdin.yml')
  if (fs.existsSync(homeYml)) {
    const y = fs.readFileSync(homeYml, 'utf8')
    const m = y.match(/api_token\s*:\s*([^\n#]+)/)
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '')
  }
  throw new Error('CROWDIN token not found. Set CROWDIN_API_TOKEN or create ~/.crowdin_api_token')
}

async function resolveProjectId(token) {
  if (process.env.LEVANTE_XLIFF_PROJECT_ID) return process.env.LEVANTE_XLIFF_PROJECT_ID.trim()
  const client = axios.create({
    baseURL: 'https://api.crowdin.com/api/v2',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000
  })
  let offset = 0
  const limit = 500
  while (true) {
    const { data } = await client.get('/projects', { params: { offset, limit } })
    const arr = (data && data.data) || []
    for (const item of arr) {
      const p = item.data
      if (p && p.identifier === 'levante-xliff') return String(p.id)
    }
    if (arr.length < limit) break
    offset += limit
  }
  throw new Error('levante-xliff project not found via API')
}

function buildFilesEntries() {
  const xliffRoot = path.join(projectRoot, 'xliff-out')
  if (!fs.existsSync(xliffRoot)) return []
  const entries = []
  const skip = new Set(['child_survey','child_survey_updated','child_survey_es_updated'])
  for (const dir of fs.readdirSync(xliffRoot)) {
    const full = path.join(xliffRoot, dir)
    if (!fs.statSync(full).isDirectory()) continue
    if (skip.has(dir)) continue
    const src = path.join('xliff-out', dir, `${dir}-source-en-US.xliff`)
    if (!fs.existsSync(path.join(projectRoot, src))) continue
    const tr = path.join('xliff-out', dir, `${dir}-%locale%.xliff`)
    entries.push({ source: src, translation: tr })
  }
  return entries
}

function writeTempConfig(projectId, token) {
  const basePath = projectRoot
  const lines = []
  lines.push(`project_id: ${projectId}`)
  lines.push(`api_token: ${token}`)
  lines.push(`base_path: ${basePath}`)
  lines.push(`preserve_hierarchy: true`)
  lines.push(`files:`)
  const files = buildFilesEntries()
  if (files.length === 0) {
    // Fallback to generic mapping
    lines.push(`  - source: 'xliff-out/**/*-source-*.xliff'`)
    lines.push(`    translation: 'xliff-out/%original_file_name%-%locale%.xliff'`)
  } else {
    for (const f of files) {
      lines.push(`  - source: '${f.source}'`)
      lines.push(`    translation: '${f.translation}'`)
    }
  }
  const cfg = lines.join('\n')
  const tmp = path.join(os.tmpdir(), `crowdin-xliff.${Date.now()}.yml`)
  fs.writeFileSync(tmp, cfg, 'utf8')
  return tmp
}

async function main() {
  const args = process.argv.slice(2)
  const action = args[0] || 'upload-sources'
  const token = await resolveToken()
  const projectId = await resolveProjectId(token)
  const cfgPath = writeTempConfig(projectId, token)

  let cmdArgs
  if (action === 'upload-sources') cmdArgs = ['upload', 'sources', '--config', cfgPath]
  else if (action === 'upload-translations') cmdArgs = ['upload', 'translations', '--config', cfgPath]
  else if (action === 'download') cmdArgs = ['download', '--config', cfgPath]
  else {
    console.error('Usage: node scripts/xliff-crowdin-cli.js [upload-sources|upload-translations|download]')
    process.exit(1)
  }

  const res = spawnSync('crowdin', cmdArgs, { stdio: 'inherit' })
  if (res.status !== 0) {
    process.exit(res.status || 1)
  }
}

main().catch((e) => { console.error(e.message); process.exit(1) })
