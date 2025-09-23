#!/usr/bin/env node

import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'

const PROJECT_ID = process.env.CROWDIN_PROJECT_ID || '756721'
const TOKEN = process.env.CROWDIN_TOKEN || '161834fde81833a72996c125d9c1a1c801ae99ef15eb1d3889dfe9fbc55077aaea02b62f1e24278e'

const OUT_DIR = path.resolve('translations', 'surveyjs')
fs.mkdirSync(OUT_DIR, { recursive: true })

function api(pathname, { method = 'GET' } = {}) {
  const opts = {
    method,
    hostname: 'api.crowdin.com',
    path: `/api/v2/projects/${PROJECT_ID}${pathname}`,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    }
  }
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)) } catch { resolve({}) }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`))
        }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

async function getBranchIdByName(name) {
  const res = await api('/branches?limit=500')
  const b = (res.data || []).map(x => x.data).find(x => x.name === name)
  return b ? b.id : null
}

async function getFileIdByPath(branchId, filePath) {
  const normalized = filePath.replace(/^\/+/, '')
  let offset = 0
  const limit = 500
  while (true) {
    // Try within branch first
    let res = await api(`/files?limit=${limit}&offset=${offset}&branchId=${branchId}`)
    const items = (res.data || []).map(x => x.data)
    if (offset === 0) {
      const listing = items.map(x => x.path).slice(0, 20).join(', ')
      console.log(`ℹ️ Files (first page): ${listing}`)
    }
    const match = items.find(x => {
      const p = String(x.path || '').replace(/^\/+/, '')
      return p === normalized || p.endsWith(normalized)
    })
    if (match) return match.id
    if (items.length < limit) break
    offset += limit
  }
  // Fallback: search across all files globally (no branch filter)
  let offset2 = 0
  const limit2 = 500
  while (true) {
    const res2 = await api(`/files?limit=${limit2}&offset=${offset2}`)
    const items2 = (res2.data || []).map(x => x.data)
    const match2 = items2.find(x => {
      const p = String(x.path || '').replace(/^\/+/, '')
      return p === normalized || p.endsWith(normalized)
    })
    if (match2) return match2.id
    if (items2.length < limit2) break
    offset2 += limit2
  }
  return null
}

function downloadTo(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    https.get(url, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', err => { try { fs.unlinkSync(destPath) } catch {} ; reject(err) })
    }).on('error', reject)
  })
}

async function downloadTranslation(fileId, lang) {
  // Request a direct download URL
  const res = await api(`/translations/builds/files/download?fileId=${fileId}&targetLanguageId=${encodeURIComponent(lang)}`)
  const url = res.data && res.data.url
  if (!url) throw new Error(`No download URL for ${lang}`)
  const out = path.join(OUT_DIR, `surveyjs-${lang}.xliff`)
  await downloadTo(url, out)
  console.log(`✅ Downloaded ${lang} → ${path.relative(process.cwd(), out)}`)
}

async function main() {
  const branchId = await getBranchIdByName('main')
  if (!branchId) throw new Error('Branch "main" not found in Crowdin project')
  const fileId = await getFileIdByPath(branchId, '/surveys/surveyjs.xliff')
  if (!fileId) throw new Error('File "/surveys/surveyjs.xliff" not found in Crowdin project')

  // Project locales we care about
  const locales = ['de', 'de-CH', 'en-US', 'en-GH', 'es-AR', 'es-CO', 'fr-CA', 'nl']
  // Try download; for 'nl' and 'de' also try country-specific fallback if needed
  for (const lang of locales) {
    const tries = lang === 'nl' ? ['nl', 'nl-NL']
      : lang === 'de' ? ['de', 'de-DE']
      : [lang]
    let ok = false
    for (const t of tries) {
      try { await downloadTranslation(fileId, t); ok = true; break } catch (_) {}
    }
    if (!ok) console.warn(`⚠️  Skipped ${lang}: not available`)
  }
}

main().catch(err => { console.error('❌', err.message || err); process.exit(1) })


