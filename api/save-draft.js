#!/usr/bin/env node

async function getStorage() {
  const mod = await import('@google-cloud/storage')
  return mod.Storage
}

function getServiceAccountFromEnv() {
  const key = process.env.GCP_SA_KEY
  if (!key) return null
  try {
    const json = Buffer.from(key, /^[A-Za-z0-9+/=]+$/.test(key) ? 'base64' : 'utf8').toString('utf8')
    return JSON.parse(json)
  } catch (_e) {
    try { return JSON.parse(key) } catch { return null }
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  const allowed = [
    'https://levante-survey-preview.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ]
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method === 'GET') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { fileName, json } = req.body || {}
    if (!fileName || !json || typeof json !== 'object') {
      return res.status(400).json({ error: 'Missing fileName or json' })
    }
    const allowedFiles = new Set([
      'child_survey.json',
      'parent_survey_family.json',
      'parent_survey_child.json',
      'teacher_survey_general.json',
      'teacher_survey_classroom.json'
    ])
    if (!allowedFiles.has(fileName)) {
      return res.status(400).json({ error: 'Invalid fileName' })
    }

    const projectId = process.env.GCP_PROJECT_ID || 'hs-levante-admin-dev'
    const bucketName = process.env.DRAFT_BUCKET || 'levante-assets-draft'
    const credentials = getServiceAccountFromEnv()

    const Storage = await getStorage()
    const storage = new Storage(credentials ? { projectId, credentials } : { projectId })
    const bucket = storage.bucket(bucketName)
    const file = bucket.file(`surveys/${fileName}`)

    const data = JSON.stringify(json, null, 2)
    await file.save(Buffer.from(data, 'utf8'), {
      contentType: 'application/json; charset=utf-8',
      resumable: false,
      metadata: { cacheControl: 'no-cache' }
    })

    return res.status(200).json({ ok: true, path: `gs://${bucketName}/surveys/${fileName}` })
  } catch (e) {
    console.error('save-draft error', e)
    return res.status(500).json({ error: String(e?.message || e) })
  }
}
