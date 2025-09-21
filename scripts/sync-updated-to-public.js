#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const srcDir = path.join(projectRoot, 'surveys')
const dstDir = path.join(projectRoot, 'public', 'surveys')

function main() {
  if (!fs.existsSync(srcDir)) {
    console.error(`❌ Source directory not found: ${srcDir}`)
    process.exit(1)
  }
  fs.mkdirSync(dstDir, { recursive: true })
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('_updated.json'))
  if (files.length === 0) {
    console.log('ℹ️  No *_updated.json files to sync')
    return
  }
  for (const f of files) {
    const data = fs.readFileSync(path.join(srcDir, f), 'utf8')
    fs.writeFileSync(path.join(dstDir, f), data, 'utf8')
    console.log(`📄 Synced ${f} → public/surveys/${f}`)
  }
  console.log('✅ Local updated surveys synced to public/surveys')
}

main()
