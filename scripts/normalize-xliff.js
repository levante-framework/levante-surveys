#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

const root = process.cwd()

function normalizeFile(p) {
  let s = fs.readFileSync(p, 'utf8')
  // Ensure target state is translated (Crowdin progress)
  s = s.replace(/<target\s+state="needs-translation"/g, '<target state="translated"')
  // Optional: normalize whitespace-only targets to source to avoid empties
  // (skip to keep exact content)
  fs.writeFileSync(p, s, 'utf8')
  console.log(`✅ normalized ${path.relative(root, p)}`)
}

function walk(dir, matcher) {
  for (const e of fs.readdirSync(dir)) {
    const full = path.join(dir, e)
    const st = fs.statSync(full)
    if (st.isDirectory()) walk(full, matcher)
    else if (matcher(full)) normalizeFile(full)
  }
}

function main() {
  const args = process.argv.slice(2)
  const base = args[0] || path.join(root, 'xliff-out')
  const langs = new Set(args.slice(1).filter(Boolean))
  const matcher = (p) => {
    if (!p.endsWith('.xliff')) return false
    if (langs.size === 0) return true
    for (const l of langs) {
      if (p.endsWith(`-${l}.xliff`)) return true
    }
    return false
  }
  walk(base, matcher)
}

main()



