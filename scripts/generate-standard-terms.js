#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const surveysDir = path.join(projectRoot, 'surveys')
const fixesDir = path.join(projectRoot, 'fixes')
const outputPath = path.join(fixesDir, 'surveyjs.json')

// Top-level standard SurveyJS terms we care about
const STANDARD_KEYS = [
  'startSurveyText',
  'pagePrevText',
  'pageNextText',
  'completeText',
  'progressText',
  'requiredText',
  'requiredError',
  'questionTitleTemplate',
  'noQuestionErrorText'
]

// Only consider these five core surveys
const SURVEY_FILES = [
  'child_survey.json',
  'parent_survey_family.json',
  'parent_survey_child.json',
  'teacher_survey_general.json',
  'teacher_survey_classroom.json',
  // Prefer updated versions when present
  'child_survey_updated.json',
  'parent_survey_family_updated.json',
  'parent_survey_child_updated.json',
  'teacher_survey_general_updated.json',
  'teacher_survey_classroom_updated.json'
]

function mergeTranslations(target, source) {
  if (!source || typeof source !== 'object') return
  for (const [lang, value] of Object.entries(source)) {
    if (value == null || String(value).trim() === '') continue
    // Only set if empty to avoid clobbering richer values from other files
    if (!target[lang] || String(target[lang]).trim() === '') {
      target[lang] = value
    }
  }
}

function main() {
  const consolidated = {}
  for (const key of STANDARD_KEYS) consolidated[key] = {}

  let processed = 0
  for (const file of SURVEY_FILES) {
    const p = path.join(surveysDir, file)
    if (!fs.existsSync(p)) continue
    try {
      const json = JSON.parse(fs.readFileSync(p, 'utf8'))
      for (const stdKey of STANDARD_KEYS) {
        if (json && typeof json[stdKey] === 'object') {
          mergeTranslations(consolidated[stdKey], json[stdKey])
        }
      }
      processed++
    } catch (e) {
      console.warn(`⚠️ Skipping ${file}: ${e.message}`)
    }
  }

  // Prune empty keys
  for (const k of Object.keys(consolidated)) {
    if (Object.keys(consolidated[k]).length === 0) delete consolidated[k]
  }

  fs.mkdirSync(fixesDir, { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(consolidated, null, 2), 'utf8')
  console.log(`✅ Wrote ${outputPath} (from ${processed} survey files)`)
}

main()


