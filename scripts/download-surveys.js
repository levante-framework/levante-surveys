#!/usr/bin/env node

/**
 * Script to download all surveys from GCS bucket to local surveys folder
 */

import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Get current directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const surveysDir = path.join(projectRoot, 'surveys')

// Configuration (mirroring src/constants/bucket.ts)
const LEVANTE_BUCKET_URL = process.env.VITE_FIREBASE_PROJECT === 'road-dashboard'
  ? 'https://storage.googleapis.com/road-dashboard'
  : 'https://storage.googleapis.com/levante-assets-dev'

const SURVEY_FILES = {
  PARENT_FAMILY: 'parent_survey_family.json',
  PARENT_CHILD: 'parent_survey_child.json',
  CHILD: 'child_survey.json',
  TEACHER_GENERAL: 'teacher_survey_general.json',
  TEACHER_CLASSROOM: 'teacher_survey_classroom.json'
}

/**
 * Download a single survey file
 */
async function downloadSurvey(surveyKey, filename) {
  const url = `${LEVANTE_BUCKET_URL}/surveys/${filename}`
  const outputPath = path.join(surveysDir, filename)

  try {
    console.log(`📥 Downloading ${surveyKey} from ${url}`)

    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'Accept': 'application/json'
      }
    })

    // Ensure the surveys directory exists
    if (!fs.existsSync(surveysDir)) {
      fs.mkdirSync(surveysDir, { recursive: true })
    }

    // Pretty print the JSON
    const jsonData = JSON.stringify(response.data, null, 2)

    // Write to file
    fs.writeFileSync(outputPath, jsonData, 'utf8')

    console.log(`✅ Downloaded ${filename} (${(jsonData.length / 1024).toFixed(2)} KB)`)

    return {
      success: true,
      key: surveyKey,
      filename: filename,
      size: jsonData.length
    }

  } catch (error) {
    console.error(`❌ Failed to download ${surveyKey}:`, error.message)
    return {
      success: false,
      key: surveyKey,
      filename: filename,
      error: error.message
    }
  }
}

/**
 * Download all surveys
 */
async function downloadAllSurveys() {
  console.log('🚀 Starting survey download from GCS bucket')
  console.log(`📡 Bucket URL: ${LEVANTE_BUCKET_URL}`)
  console.log(`📁 Output directory: ${surveysDir}`)
  console.log(`📋 Surveys to download: ${Object.keys(SURVEY_FILES).length}`)
  console.log('')

  const results = []

  // Download surveys in parallel for speed
  const downloadPromises = Object.entries(SURVEY_FILES).map(([key, filename]) =>
    downloadSurvey(key, filename)
  )

  const downloadResults = await Promise.all(downloadPromises)
  results.push(...downloadResults)

  // Summary
  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)

  console.log('')
  console.log('📊 Download Summary:')
  console.log(`✅ Successful: ${successful.length}`)
  console.log(`❌ Failed: ${failed.length}`)

  if (successful.length > 0) {
    console.log('')
    console.log('📁 Downloaded files:')
    successful.forEach(result => {
      console.log(`   • ${result.filename} (${(result.size / 1024).toFixed(2)} KB)`)
    })
  }

  if (failed.length > 0) {
    console.log('')
    console.log('⚠️  Failed downloads:')
    failed.forEach(result => {
      console.log(`   • ${result.filename}: ${result.error}`)
    })
  }

  console.log('')
  console.log(`🎯 Complete! Downloaded ${successful.length}/${results.length} surveys to ./surveys/`)

  return results
}

// Run the script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  downloadAllSurveys()
    .then((results) => {
      const exitCode = results.some(r => !r.success) ? 1 : 0
      process.exit(exitCode)
    })
    .catch((error) => {
      console.error('💥 Script failed:', error)
      process.exit(1)
    })
}

export { downloadAllSurveys, downloadSurvey }
