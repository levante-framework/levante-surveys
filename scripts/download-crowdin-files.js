#!/usr/bin/env node
/**
 * Download survey CSVs directly from Crowdin using API v2.
 * Defaults to folder "/Surveys-with-en_US"; override with --folder.
 * Saves files into local surveys/ as *_crowdin_translations.csv for merging.
 */

import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const surveysDir = path.join(projectRoot, 'surveys')

const DEFAULT_FOLDER = '/Surveys-with-en_US'
const TARGETS = [
  { crowdinPath: `${DEFAULT_FOLDER}/child_survey_translations.csv`, local: 'child_survey_crowdin_translations.csv' },
  { crowdinPath: `${DEFAULT_FOLDER}/parent_survey_family_translations.csv`, local: 'parent_survey_family_crowdin_translations.csv' },
  { crowdinPath: `${DEFAULT_FOLDER}/parent_survey_child_translations.csv`, local: 'parent_survey_child_crowdin_translations.csv' },
  { crowdinPath: `${DEFAULT_FOLDER}/teacher_survey_general_translations.csv`, local: 'teacher_survey_general_crowdin_translations.csv' },
  { crowdinPath: `${DEFAULT_FOLDER}/teacher_survey_classroom_translations.csv`, local: 'teacher_survey_classroom_crowdin_translations.csv' },
]

function parseArgs() {
  const args = process.argv.slice(2)
  const folderIdx = args.findIndex((a) => a === '--folder')
  const folder = folderIdx !== -1 && args[folderIdx + 1] ? args[folderIdx + 1] : DEFAULT_FOLDER
  return { folder }
}

function readCrowdinConfig() {
  const configPath = path.join(projectRoot, 'crowdin.yml')
  let projectId = process.env.CROWDIN_PROJECT_ID
  let token = process.env.CROWDIN_TOKEN || process.env.CROWDIN_API_TOKEN || process.env.CROWDIN_PERSONAL_TOKEN
  if (fs.existsSync(configPath)) {
    const yml = fs.readFileSync(configPath, 'utf8')
    if (!projectId) projectId = (yml.match(/\bproject_id\s*:\s*([^\n#]+)/) || [])[1]?.trim().replace(/^['"]|['"]$/g, '')
    if (!token) token = (yml.match(/\bapi_token\s*:\s*([^\n#]+)/) || [])[1]?.trim().replace(/^['"]|['"]$/g, '')
  }
  if (!projectId) throw new Error('Missing CROWDIN_PROJECT_ID (or project_id in crowdin.yml)')
  if (!token) throw new Error('Missing CROWDIN_TOKEN/CROWDIN_API_TOKEN (or api_token in crowdin.yml)')
  return { projectId, token }
}

function createClient(token) {
  return axios.create({
    baseURL: 'https://api.crowdin.com/api/v2',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000,
  })
}

async function listAllFiles(client, projectId) {
  const files = []
  let offset = 0
  const limit = 500
  while (true) {
    const { data } = await client.get(`/projects/${projectId}/files`, { params: { limit, offset } })
    for (const item of data.data || []) files.push(item.data)
    if (!data || !data.data || data.data.length < limit) break
    offset += limit
  }
  return files
}

async function downloadFile(client, projectId, fileId) {
  const { data } = await client.get(`/projects/${projectId}/files/${fileId}/download`)
  const url = data.data && data.data.url
  if (!url) throw new Error('No download URL received')
  const res = await axios.get(url, { responseType: 'arraybuffer' })
  return res.data
}

async function main() {
  const { folder } = parseArgs()
  const { projectId, token } = readCrowdinConfig()
  const client = createClient(token)

  if (!fs.existsSync(surveysDir)) fs.mkdirSync(surveysDir, { recursive: true })

  const allFiles = await listAllFiles(client, projectId)
  const byPath = new Map(allFiles.map((f) => [f.path, f]))

  let downloaded = 0
  for (const t of TARGETS.map((t) => ({ ...t, crowdinPath: t.crowdinPath.replace(DEFAULT_FOLDER, folder) }))) {
    const meta = byPath.get(t.crowdinPath)
    if (!meta) {
      console.log(`Skip (not found in Crowdin): ${t.crowdinPath}`)
      continue
    }
    try {
      const content = await downloadFile(client, projectId, meta.id)
      const outPath = path.join(surveysDir, t.local)
      fs.writeFileSync(outPath, content)
      downloaded += 1
      console.log(`Downloaded: ${t.crowdinPath} -> surveys/${t.local}`)
    } catch (e) {
      console.log(`Failed to download ${t.crowdinPath}: ${e.message}`)
    }
  }
  if (downloaded === 0) process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1) })
}


