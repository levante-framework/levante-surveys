#!/usr/bin/env node
/**
 * Copy English source text (en) to en-GH translations in Crowdin for our 5 survey files.
 *
 * Requirements (env):
 * - CROWDIN_PROJECT_ID (numeric)
 * - CROWDIN_TOKEN (personal access token)
 *
 * Usage:
 *   node scripts/crowdin-copy-en-to-en-gh.js [--dry-run] [--only-missing] [--files child,parent-family,parent-child,teacher-general,teacher-classroom]
 *
 * Defaults:
 * - Overwrites existing en-GH translations unless --only-missing is provided
 * - Targets these Crowdin file paths (must match uploaded sources):
 *   /surveys/child_survey_translations.csv
 *   /surveys/parent_survey_family_translations.csv
 *   /surveys/parent_survey_child_translations.csv
 *   /surveys/teacher_survey_general_translations.csv
 *   /surveys/teacher_survey_classroom_translations.csv
 */

import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const CROWDIN_API_BASE = 'https://api.crowdin.com/api/v2'

const DEFAULT_FILE_SUFFIXES = [
  '/surveys/child_survey_translations.csv',
  '/surveys/parent_survey_family_translations.csv',
  '/surveys/parent_survey_child_translations.csv',
  '/surveys/teacher_survey_general_translations.csv',
  '/surveys/teacher_survey_classroom_translations.csv',
]

function parseArgs() {
  const args = process.argv.slice(2)
  const flags = {
    dryRun: args.includes('--dry-run'),
    onlyMissing: args.includes('--only-missing'),
    fileSuffixes: DEFAULT_FILE_SUFFIXES,
    to: 'en-GH',
    project: undefined,
    token: undefined,
  }
  const toArgIndex = args.findIndex((a) => a === '--to')
  if (toArgIndex !== -1 && args[toArgIndex + 1]) {
    flags.to = args[toArgIndex + 1]
  }
  const projectIdx = args.findIndex((a) => a === '--project')
  if (projectIdx !== -1 && args[projectIdx + 1]) {
    flags.project = args[projectIdx + 1]
  }
  const tokenIdx = args.findIndex((a) => a === '--token')
  if (tokenIdx !== -1 && args[tokenIdx + 1]) {
    flags.token = args[tokenIdx + 1]
  }
  const filesArgIndex = args.findIndex((a) => a === '--files')
  if (filesArgIndex !== -1 && args[filesArgIndex + 1]) {
    const tokens = args[filesArgIndex + 1].split(',').map((s) => s.trim())
    const map = {
      'child': '/surveys/child_survey_translations.csv',
      'parent-family': '/surveys/parent_survey_family_translations.csv',
      'parent-child': '/surveys/parent_survey_child_translations.csv',
      'teacher-general': '/surveys/teacher_survey_general_translations.csv',
      'teacher-classroom': '/surveys/teacher_survey_classroom_translations.csv',
    }
    flags.fileSuffixes = tokens.map((t) => map[t] || t)
  }
  return flags
}

function requireEnv(name, fallback) {
  const value = fallback || process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function loadCrowdinConfigFromFile() {
  try {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const root = path.resolve(__dirname, '..')
    const configPath = path.join(root, 'crowdin.yml')
    if (!fs.existsSync(configPath)) return null
    const content = fs.readFileSync(configPath, 'utf8')
    // naive YAML extraction for project_id and api_token
    const projectMatch = content.match(/\bproject_id\s*:\s*([^\n#]+)/)
    const tokenMatch = content.match(/\bapi_token\s*:\s*([^\n#]+)/)
    const projectRaw = projectMatch ? projectMatch[1].trim() : undefined
    const tokenRaw = tokenMatch ? tokenMatch[1].trim() : undefined
    const strip = (v) => v ? v.replace(/^['"]|['"]$/g, '') : undefined
    const project_id = strip(projectRaw)
    const api_token = strip(tokenRaw)
    if (!project_id && !api_token) return null
    return { project_id, api_token }
  } catch {
    return null
  }
}

function createClient(token) {
  return axios.create({
    baseURL: CROWDIN_API_BASE,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
    maxBodyLength: Infinity,
  })
}

async function listAllFiles(client, projectId) {
  const files = []
  let offset = 0
  const limit = 500
  while (true) {
    const { data } = await client.get(`/projects/${projectId}/files`, { params: { limit, offset } })
    for (const item of data.data || []) {
      files.push(item.data)
    }
    if (!data || !data.data || data.data.length < limit) break
    offset += limit
  }
  return files
}

async function listStringsForFile(client, projectId, fileId) {
  const strings = []
  let offset = 0
  const limit = 1000
  while (true) {
    const { data } = await client.get(`/projects/${projectId}/strings`, { params: { fileId, limit, offset } })
    for (const item of data.data || []) {
      strings.push(item.data)
    }
    if (!data || !data.data || data.data.length < limit) break
    offset += limit
  }
  return strings
}

async function getExistingTranslation(client, projectId, stringId, languageId) {
  // Returns first translation if exists, else null
  const { data } = await client.get(`/projects/${projectId}/translations`, {
    params: { stringId, languageId, limit: 1 },
  })
  const item = (data.data && data.data[0] && data.data[0].data) || null
  return item
}

async function addOrUpdateTranslation(client, projectId, stringId, languageId, text) {
  // Add translation. If one exists, we soft-replace by deleting and re-adding to avoid conflicts.
  try {
    await client.post(`/projects/${projectId}/translations`, {
      stringId,
      languageId,
      text,
    })
    return { action: 'created' }
  } catch (e) {
    // Try to fetch existing translation and update it
    try {
      const existing = await getExistingTranslation(client, projectId, stringId, languageId)
      if (existing && existing.id) {
        await client.delete(`/projects/${projectId}/translations/${existing.id}`)
        await client.post(`/projects/${projectId}/translations`, { stringId, languageId, text })
        return { action: 'replaced' }
      }
    } catch (_) {
      // fallthrough
    }
    throw e
  }
}

async function main() {
  const { dryRun, onlyMissing, fileSuffixes, to, project, token: tokenFlag } = parseArgs()

  let projectId = project || process.env.CROWDIN_PROJECT_ID
  let token = tokenFlag || process.env.CROWDIN_TOKEN || process.env.CROWDIN_API_TOKEN || process.env.CROWDIN_PERSONAL_TOKEN
  if (!projectId || !token) {
    const cfg = loadCrowdinConfigFromFile()
    if (cfg) {
      projectId = projectId || cfg.project_id
      token = token || cfg.api_token
    }
  }
  if (!projectId) throw new Error('Missing required env var: CROWDIN_PROJECT_ID (or project_id in crowdin.yml)')
  if (!token) throw new Error('Missing required env var: CROWDIN_TOKEN/CROWDIN_API_TOKEN (or api_token in crowdin.yml)')

  const client = createClient(token)

  const allFiles = await listAllFiles(client, projectId)
  const byPath = new Map(allFiles.map((f) => [f.path, f]))

  const targets = fileSuffixes
    .map((suffix) => {
      // Prefer exact path match; fallback to suffix match
      if (byPath.has(suffix)) return byPath.get(suffix)
      const match = allFiles.find((f) => f.path && f.path.endsWith(suffix))
      return match || null
    })
    .filter(Boolean)

  if (targets.length === 0) {
    console.error('No target files found in Crowdin. Checked suffixes:', fileSuffixes)
    process.exit(1)
  }

  console.log(`Found ${targets.length} target files in Crowdin.`)
  console.log(`Target language: ${to}`)

  let totalProcessed = 0
  let totalCreated = 0
  let totalReplaced = 0
  let totalSkipped = 0

  for (const file of targets) {
    console.log(`\nProcessing file: ${file.path} (id=${file.id})`)
    const strings = await listStringsForFile(client, projectId, file.id)
    console.log(`Strings: ${strings.length}`)

    // Process with small concurrency to be gentle on API
    const concurrency = 10
    let index = 0
    async function worker() {
      while (index < strings.length) {
        const current = strings[index++]
        const stringId = current.id
        const sourceText = current.text || ''

        // Decide whether to write
        if (onlyMissing) {
          const existing = await getExistingTranslation(client, projectId, stringId, to)
          if (existing && typeof existing.text === 'string' && existing.text.length > 0) {
            totalSkipped++
            continue
          }
        }

        if (dryRun) {
          totalProcessed++
          continue
        }

        try {
          const res = await addOrUpdateTranslation(client, projectId, stringId, to, sourceText)
          totalProcessed++
          if (res.action === 'created') totalCreated++
          if (res.action === 'replaced') totalReplaced++
        } catch (err) {
          console.error(`Failed to set translation for stringId=${stringId}: ${err.message}`)
        }
      }
    }

    const workers = Array.from({ length: concurrency }, () => worker())
    await Promise.all(workers)
  }

  console.log('\nDone.')
  console.log(`Processed: ${totalProcessed}`)
  console.log(`Created:  ${totalCreated}`)
  console.log(`Replaced:  ${totalReplaced}`)
  console.log(`Skipped:   ${totalSkipped}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})


