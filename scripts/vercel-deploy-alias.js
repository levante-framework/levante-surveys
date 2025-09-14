#!/usr/bin/env node

import { spawnSync } from 'child_process'

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...options })
  return res
}

function main() {
  // Deploy to Vercel prod non-interactively
  const deploy = run('vercel', ['--prod', '--yes'])
  if (deploy.status !== 0) {
    process.stderr.write(deploy.stderr || deploy.stdout || 'Vercel deploy failed')
    process.exit(deploy.status || 1)
  }
  const out = (deploy.stdout || '').trim()
  process.stdout.write(out + '\n')

  // Extract deployment URL
  const match = out.match(/https:\/\/[a-zA-Z0-9.-]+\.vercel\.app/)
  const url = match ? match[0] : null
  if (!url) {
    console.error('❌ Could not determine deployment URL from Vercel output')
    process.exit(1)
  }
  console.log('DEPLOY_URL=' + url)

  // Alias with retries
  const aliasTarget = 'levante-survey-preview.vercel.app'
  for (let i = 1; i <= 5; i++) {
    const alias = run('vercel', ['alias', 'set', url, aliasTarget], { stdio: 'pipe' })
    if (alias.status === 0) {
      process.stdout.write((alias.stdout || '') + '\n')
      console.log('✅ Alias set to ' + aliasTarget)
      process.exit(0)
    }
    process.stderr.write((alias.stderr || alias.stdout || '').toString())
    console.log(`⏳ Alias attempt ${i} failed; retrying in 10s...`)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000)
  }
  console.error('❌ Failed to alias after retries')
  process.exit(1)
}

main()


