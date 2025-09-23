#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const outDir = path.resolve('xliff-out', 'surveyjs')

function runCrowdin(args) {
  const res = spawnSync('npx', ['-y', '@crowdin/cli', ...args], { stdio: 'inherit' })
  return res.status || 0
}

function main() {
  if (!fs.existsSync(outDir)) {
    console.error(`Not found: ${outDir}. Run the xliff export first.`)
    process.exit(1)
  }
  const files = fs.readdirSync(outDir).filter(f => /^surveyjs-(.+)\.xliff$/.test(f))
  const uploads = files.filter(f => !/surveyjs-source\.xliff$/.test(f))
  if (uploads.length === 0) {
    console.log('No bilingual XLIFF files to upload.')
    return
  }
  let failures = 0
  for (const f of uploads) {
    const m = f.match(/^surveyjs-(.+)\.xliff$/)
    const locale = m ? m[1] : ''
    if (!locale) continue
    if (locale === 'en') continue // project doesn't have plain 'en'
    const srcPath = path.posix.join('xliff-out/surveyjs', f)
    const dest = '/surveys/surveyjs_%locale%.xliff'
    const args = ['upload', 'translations', '-c', 'crowdin.yml', '-l', locale, '-s', srcPath, '-t', dest, '-b', 'main']
    const code = runCrowdin(args)
    if (code !== 0) failures++
  }
  if (failures > 0) process.exit(1)
}

main()


