#!/usr/bin/env node

/**
 * Setup script to copy survey JSON files to public directory for e2e testing
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const sourceDir = path.join(projectRoot, 'surveys')
const targetDir = path.join(projectRoot, 'public', 'surveys')

// Ensure target directory exists
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true })
}

// Survey files to copy
const surveyFiles = [
  'child_survey_updated.json',
  'parent_survey_family_updated.json',
  'parent_survey_child_updated.json',
  'teacher_survey_general_updated.json',
  'teacher_survey_classroom_updated.json'
]

console.log('📋 Copying survey files for e2e testing...')

surveyFiles.forEach(file => {
  const sourcePath = path.join(sourceDir, file)
  const targetPath = path.join(targetDir, file.replace('_updated', ''))
  
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath)
    console.log(`✅ Copied: ${file} → public/surveys/${path.basename(targetPath)}`)
  } else {
    console.log(`⚠️  File not found: ${file}`)
  }
})

console.log('🎉 Survey files setup complete!')
