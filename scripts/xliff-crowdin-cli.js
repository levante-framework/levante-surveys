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

async function resolveProjectId(token, opts = {}) {
  // Priority: explicit envs → CLI arg → known identifiers
  if (process.env.LEVANTE_XLIFF_PROJECT_ID) return process.env.LEVANTE_XLIFF_PROJECT_ID.trim()
  if (process.env.LEVANTE_TRANSLATIONS_PROJECT_ID) return process.env.LEVANTE_TRANSLATIONS_PROJECT_ID.trim()
  if (process.env.CROWDIN_PROJECT_ID) return process.env.CROWDIN_PROJECT_ID.trim()

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
      if (opts.project) {
        // match by numeric id, identifier, or name
        if (String(p.id) === String(opts.project)) return String(p.id)
        if (p.identifier === opts.project) return String(p.id)
        if (p.name === opts.project) return String(p.id)
      }
      if (p && p.identifier === 'levante-xliff') return String(p.id)
      if (p && p.identifier === 'levantetranslations') return String(p.id)
    }
    if (arr.length < limit) break
    offset += limit
  }
  throw new Error('Crowdin project not found (tried envs, --project, levante-xliff, levantetranslations)')
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
    const src = path.join('xliff-out', dir, `${dir}-source.xliff`)
    if (!fs.existsSync(path.join(projectRoot, src))) continue
    const tr = path.join('xliff-out', dir, `${dir}-%locale%.xliff`)
    // Desired destination folders on Crowdin
    const destSource = path.posix.join('surveys', `${dir}-source.xliff`)
    const destTranslation = path.posix.join('surveys', `${dir}-%locale%.xliff`)
    entries.push({ source: src, translation: tr, destSource, destTranslation })
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
    lines.push(`  - source: 'xliff-out/**/*-source*.xliff'`)
    lines.push(`    translation: 'xliff-out/%original_file_name%-%locale%.xliff'`)
    lines.push(`    dest: 'surveys/%original_path%/%original_file_name%'`)
    lines.push(`    languages_mapping:`)
    lines.push(`      locale:`)
    lines.push(`        en-US: 'en-US'`)
    lines.push(`        de: 'de'`)
    lines.push(`        de-CH: 'de-CH'`)
    lines.push(`        nl: 'nl-NL'`)
    lines.push(`        en-GH: 'en-GH'`)
    lines.push(`        es-AR: 'es-AR'`)
    lines.push(`        es-CO: 'es-CO'`)
    lines.push(`        fr-CA: 'fr-CA'`)
  } else {
    for (const f of files) {
      lines.push(`  - source: '${f.source}'`)
      lines.push(`    translation: '${f.translation}'`)
      lines.push(`    dest: '${f.destSource}'`)
      lines.push(`    languages_mapping:`)
      lines.push(`      locale:`)
      lines.push(`        en-US: 'en-US'`)
      lines.push(`        de: 'de'`)
      lines.push(`        de-CH: 'de-CH'`)
      lines.push(`        nl: 'nl-NL'`)
      lines.push(`        en-GH: 'en-GH'`)
      lines.push(`        es-AR: 'es-AR'`)
      lines.push(`        es-CO: 'es-CO'`)
      lines.push(`        fr-CA: 'fr-CA'`)
    }
  }
  const cfg = lines.join('\n')
  const tmp = path.join(os.tmpdir(), `crowdin-xliff.${Date.now()}.yml`)
  fs.writeFileSync(tmp, cfg, 'utf8')
  return tmp
}

async function listFiles(token, projectId) {
  const client = axios.create({
    baseURL: 'https://api.crowdin.com/api/v2',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000
  })
  let offset = 0
  const limit = 500
  const files = []
  while (true) {
    const { data } = await client.get(`/projects/${projectId}/files`, { params: { offset, limit } })
    const arr = (data && data.data) || []
    for (const item of arr) files.push(item.data)
    if (arr.length < limit) break
    offset += limit
  }
  return files
}

async function deleteFile(token, projectId, fileId) {
  const client = axios.create({
    baseURL: 'https://api.crowdin.com/api/v2',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000
  })
  await client.delete(`/projects/${projectId}/files/${fileId}`)
}

async function main() {
  const args = process.argv.slice(2)
  const action = args[0] || 'upload-sources'
  // parse options
  let projectOpt = null
  const passthrough = []
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--project' || args[i] === '-p') {
      projectOpt = args[i + 1]
      i++
    } else {
      passthrough.push(args[i])
    }
  }
  const token = await resolveToken()
  const projectId = await resolveProjectId(token, { project: projectOpt })

  if (action === 'project-id' || action === 'print-project-id') {
    // Print only the numeric id so callers can capture it
    console.log(projectId)
    return
  }

  // If uploading translations, normalize targets to 'translated' for specific locales
  if (action === 'upload-translations') {
    // discover explicit --language (Crowdin allows only one)
    let langArg = null
    for (let i = 0; i < passthrough.length; i++) {
      if (passthrough[i] === '--language' || passthrough[i] === '-l') {
        langArg = passthrough[i + 1]
        break
      }
    }
    const langsToNormalize = langArg ? [langArg] : ['de', 'nl', 'en-GH']
    // Never touch de-CH per policy
    const filtered = langsToNormalize.filter(l => l !== 'de-CH')
    if (filtered.length > 0) {
      spawnSync(process.execPath, [path.join(projectRoot, 'scripts', 'normalize-xliff.js'), path.join(projectRoot, 'xliff-out'), ...filtered], { stdio: 'inherit' })
    }
  }

  if (action === 'cleanup-old-sources') {
    const files = await listFiles(token, projectId)
    const targets = files.filter(f => f.name.endsWith('-source-en-US.xliff'))
    for (const f of targets) {
      try {
        await deleteFile(token, projectId, f.id)
        console.log(`🗑️  Deleted ${f.name} (id ${f.id})`)
      } catch (e) {
        console.error(`Failed to delete ${f.name}: ${e.message}`)
      }
    }
    console.log(`Done. Deleted ${targets.length} old source files.`)
    return
  }

  if (action === 'cleanup-nested') {
    // Remove any files under surveys/<survey>/... to leave only flattened surveys/* files
    const files = await listFiles(token, projectId)
    const nested = files.filter(f => /^surveys\/.+\/.+/.test(f.path || f.name))
    let count = 0
    for (const f of nested) {
      try { await deleteFile(token, projectId, f.id); count++; console.log(`🗑️  Deleted nested ${f.path || f.name} (id ${f.id})`) } catch (e) { console.error(`Failed to delete ${f.name}: ${e.message}`) }
    }
    console.log(`Done. Deleted ${count} nested files.`)
    return
  }

  if (action === 'cleanup-updated') {
    // Delete any files in Crowdin whose name contains '_updated'
    const files = await listFiles(token, projectId)
    const targets = files.filter(f => (f.name || '').includes('_updated'))
    let count = 0
    for (const f of targets) {
      try {
        await deleteFile(token, projectId, f.id)
        count++
        console.log(`🗑️  Deleted ${f.path || f.name} (id ${f.id})`)
      } catch (e) {
        console.error(`Failed to delete ${f.name}: ${e.message}`)
      }
    }
    console.log(`Done. Deleted ${count} '_updated' files.`)
    return
  }

  const cfgPath = writeTempConfig(projectId, token)

  let cmdArgs
  if (action === 'upload-sources') cmdArgs = ['upload', 'sources', '--config', cfgPath, ...passthrough]
  else if (action === 'upload-translations') {
    // default helpful flags unless user already provided them
    const hasImportEq = passthrough.some(a => a === '--import-eq-suggestions' || a === '--no-import-eq-suggestions')
    const hasAutoApprove = passthrough.some(a => a === '--auto-approve-imported' || a === '--no-auto-approve-imported')
    const extra = []
    if (!hasImportEq) extra.push('--import-eq-suggestions')
    if (!hasAutoApprove) extra.push('--auto-approve-imported')
    cmdArgs = ['upload', 'translations', '--config', cfgPath, ...extra, ...passthrough]
  }
  else if (action === 'download') cmdArgs = ['download', '--config', cfgPath, ...passthrough]
  else {
    console.error('Usage: node scripts/xliff-crowdin-cli.js [upload-sources|upload-translations|download|project-id|cleanup-old-sources|cleanup-nested|cleanup-updated]')
    process.exit(1)
  }

  const res = spawnSync('crowdin', cmdArgs, { stdio: 'inherit' })
  if (res.status !== 0) {
    process.exit(res.status || 1)
  }
}

main().catch((e) => { console.error(e.message); process.exit(1) })
