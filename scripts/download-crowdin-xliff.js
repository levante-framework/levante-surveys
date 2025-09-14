#!/usr/bin/env node

/**
 * Download all combined XLIFF files from levante_translations l10n_pending
 * into translations/xliff. Files are named <locale>-surveys.xliff.
 *
 * Source directory in repo:
 *   translations/xliff/
 *
 * Usage:
 *   node scripts/download-crowdin-xliff.js [--force]
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
const force = args.includes('--force') || args.includes('-force') || args.includes('-f')
const outDir = path.join(projectRoot, 'translations', 'xliff')
const manifestPath = path.join(outDir, '.xliff_manifest.json')

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }) }

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https.get(url, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage} for ${url}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', err => { fs.unlink(dest, () => {}); reject(err) })
    }).on('error', reject)
  })
}

async function main() {
  ensureDir(outDir)
  const indexUrl = 'https://api.github.com/repos/levante-framework/levante_translations/contents/translations/xliff?ref=l10n_pending'
  console.log('📥 Listing XLIFFs from l10n_pending...')
  const idx = await fetchJson(indexUrl)
  const files = idx.filter(x => {
    if (x.type !== 'file') return false
    return (
      /-surveys\.xliff$/i.test(x.name) ||
      /-itembank\.xliff$/i.test(x.name) ||
      /item-bank-translations[-_][A-Za-z]{2}(?:-[A-Za-z]{2})?\.xliff$/i.test(x.name)
    )
  })
  if (files.length === 0) {
    console.error('❌ No *-surveys.xliff files found in repo index')
    process.exit(1)
  }
  // Load existing manifest of remote SHAs we last synced
  let manifest = {}
  if (fs.existsSync(manifestPath)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch (_) { manifest = {} }
  }

  let ok = 0
  for (const f of files) {
    const url = `https://raw.githubusercontent.com/levante-framework/levante_translations/l10n_pending/translations/xliff/${f.name}`
    const dest = path.join(outDir, f.name)
    const remoteSha = f.sha
    const localSha = manifest[f.name]
    const exists = fs.existsSync(dest)

    const needsUpdate = force || !exists || localSha !== remoteSha
    if (!needsUpdate) {
      console.log(`⏭️  Up-to-date: ${f.name}`)
      ok++
      continue
    }
    try {
      console.log(`⬇️  ${exists && !force ? 'Updating' : 'Downloading'}: ${f.name}`)
      await download(url, dest)
      manifest[f.name] = remoteSha
      console.log(`   ✅ Saved ${f.name}`)
      ok++
    } catch (e) {
      console.log(`   ❌ Failed ${f.name}: ${e.message}`)
    }
  }

  // Persist manifest only if at least one succeeded
  try { fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8') } catch (_) {}

  console.log(`\n📊 Downloaded/verified: ${ok}/${files.length}`)
  process.exit(ok === files.length ? 0 : 1)
}

function fetchJson(url) {
  const headers = { 'User-Agent': 'levante-surveys/cli' }
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage} for ${url}`))
        return
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
        catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

main().catch(err => { console.error('💥', err); process.exit(1) })


