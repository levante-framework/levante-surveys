#!/usr/bin/env node

/**
 * Upload the corrected survey JSON files directly to Google Cloud Storage
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Storage } from '@google-cloud/storage'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// Google Cloud Storage configuration
const BUCKET_NAME = 'levante-dashboard-prod'

// Survey files to upload
const SURVEY_FILES = [
  'child_survey_updated.json',
  'parent_survey_child_updated.json',
  'parent_survey_family_updated.json',
  'teacher_survey_general_updated.json',
  'teacher_survey_classroom_updated.json'
]

// Mapping from updated files to target names
const FILE_MAPPING = {
  'child_survey_updated.json': 'child_survey.json',
  'parent_survey_child_updated.json': 'parent_survey_child.json',
  'parent_survey_family_updated.json': 'parent_survey_family.json',
  'teacher_survey_general_updated.json': 'teacher_survey_general.json',
  'teacher_survey_classroom_updated.json': 'teacher_survey_classroom.json'
}

async function uploadSurveyFile(sourceFileName) {
  const sourcePath = path.join(projectRoot, 'surveys', sourceFileName)
  const targetFileName = FILE_MAPPING[sourceFileName]

  if (!fs.existsSync(sourcePath)) {
    console.error(`❌ Source file not found: ${sourcePath}`)
    return false
  }

  try {
    const storage = new Storage()
    const bucket = storage.bucket(BUCKET_NAME)

    console.log(`☁️  Uploading ${sourceFileName} → ${targetFileName} to gs://${BUCKET_NAME}/surveys/...`)

    const [file] = await bucket.upload(sourcePath, {
      destination: `surveys/${targetFileName}`,
      metadata: {
        contentType: 'application/json',
        cacheControl: 'no-cache, max-age=0'
      }
    })

    console.log(`✅ Successfully uploaded ${targetFileName}`)
    return true

  } catch (error) {
    console.error(`❌ Failed to upload ${sourceFileName}:`, error.message)
    return false
  }
}

async function main() {
  console.log('🔄 Uploading Corrected Survey Files')
  console.log('='.repeat(50))
  console.log(`📦 Target bucket: gs://${BUCKET_NAME}`)
  console.log(`📁 Source directory: surveys/\n`)

  let successCount = 0
  let totalCount = SURVEY_FILES.length

  for (const fileName of SURVEY_FILES) {
    const success = await uploadSurveyFile(fileName)
    if (success) {
      successCount++
    }
    console.log() // Add spacing between uploads
  }

  console.log('📊 Upload Summary:')
  console.log(`✅ Successful uploads: ${successCount}/${totalCount}`)

  if (successCount === totalCount) {
    console.log('🎉 All corrected survey files uploaded successfully!')
    console.log('🔄 The surveys should now show proper English for en-GH language.')
    console.log('💡 You may need to refresh your browser to see the changes.')
  } else {
    console.log('⚠️  Some uploads failed. Please check the errors above.')
  }
}

main().catch(console.error)
