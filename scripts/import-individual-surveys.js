#!/usr/bin/env node

/**
 * Script to import translations from individual survey CSV files from Crowdin
 * This replaces the combined surveys.csv workflow with individual files per survey
 *
 * Usage:
 *   node scripts/import-individual-translations.js <survey-csv-file> [--upload]
 *   node scripts/import-individual-translations.js surveys/parent_survey_family_translations.csv
 *   node scripts/import-individual-translations.js surveys/child_survey_translations.csv --upload
 *   node scripts/import-individual-translations.js --all [--upload]
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Storage } from '@google-cloud/storage'
import {
  CSV_TO_JSON_MAPPING,
  isValidJsonLanguageKey
} from '../src/constants/languages.js'

// Get current directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// Google Cloud Storage configuration
const BUCKET_NAME = process.env.VITE_FIREBASE_PROJECT === 'DEV' ? 'levante-dashboard-dev' : 'road-dashboard'

// Survey file mapping - derive JSON filename from CSV filename
const SURVEY_CSV_MAPPING = {
  'child_survey_crowdin_translations.csv': 'child_survey.json',
  'parent_survey_child_crowdin_translations.csv': 'parent_survey_child.json',
  'parent_survey_family_crowdin_translations.csv': 'parent_survey_family.json',
  'teacher_survey_general_crowdin_translations.csv': 'teacher_survey_general.json',
  'teacher_survey_classroom_crowdin_translations.csv': 'teacher_survey_classroom.json'
}

/**
 * Parse CSV content into an array of objects
 */
function parseCSV(csvContent) {
  const lines = csvContent.trim().split('\n')
  if (lines.length < 2) return []

  const header = lines[0]
  const columns = []
  let current = ''
  let inQuotes = false

  // Parse header
  for (let i = 0; i < header.length; i++) {
    const char = header[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      columns.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current) {
    columns.push(current.trim())
  }

  console.log(`📋 CSV columns: ${columns.join(', ')}`)

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = []
    current = ''
    inQuotes = false

    for (let j = 0; j < line.length; j++) {
      const char = line[j]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(current)
        current = ''
      } else {
        current += char
      }
    }
    if (current !== undefined) {
      values.push(current)
    }

    // Create row object
    const row = {}
    columns.forEach((col, index) => {
      row[col] = values[index] || ''
    })

    // Extract element name from identifier, item_id, or element_name column
    if (row.identifier) {
      row.elementName = row.identifier
    } else if (row.element_name) {
      row.elementName = row.element_name
    } else if (row.item_id) {
      // Extract element name from item_id (e.g., "parent_survey_family_001" -> from element_name column)
      row.elementName = row.element_name || ''
    }

    if (row.elementName) {
      rows.push(row)
    }
  }

  console.log(`📊 Parsed ${rows.length} translation rows`)
  return rows
}

/**
 * Check if an object contains multilingual text
 */
function isMultilingualObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false
  }

  const keys = Object.keys(obj)
  return keys.some(key => isValidJsonLanguageKey(key))
}

/**
 * Recursively find and update multilingual objects in survey JSON
 */
function updateMultilingualTexts(obj, translationsMap, elementName = '', results = []) {
  if (!obj || typeof obj !== 'object') {
    return results
  }

  // Check if this object has a 'name' property that we can use as elementName
  const currentElementName = obj.name || elementName

  // If this is a multilingual object, update it
  if (isMultilingualObject(obj)) {
    // Try to find matching translations using the current element name
    const matchingTranslations = translationsMap[currentElementName] || []

    if (matchingTranslations.length > 0) {
      // Find the best matching translation by comparing English text
      const currentEnglishText = obj.default || obj.en || ''
      let bestMatch = null

      if (matchingTranslations.length === 1) {
        bestMatch = matchingTranslations[0]
      } else {
        // Try to find exact match by English text
        bestMatch = matchingTranslations.find(t => {
          const translationEnText = t.en || ''
          return translationEnText.trim() === currentEnglishText.trim()
        })
        // Don't use fallback if no exact match found - this prevents corruption
      }

      if (bestMatch) {
        // Update each language if translation exists
        for (const [csvLang, jsonLang] of Object.entries(CSV_TO_JSON_MAPPING)) {
          if (bestMatch[csvLang] && bestMatch[csvLang].trim()) {
            obj[jsonLang] = bestMatch[csvLang].trim()
          }
        }

        results.push({
          elementName: currentElementName,
          updated: true,
          translation: bestMatch,
          matchType: matchingTranslations.length === 1 ? 'single' : 'exact_text'
        })
      } else {
        results.push({
          elementName: currentElementName,
          updated: false,
          reason: 'No suitable translation match found'
        })
      }
    } else {
      results.push({
        elementName: currentElementName,
        updated: false,
        reason: 'No matching translation found'
      })
    }
  }

  // Recursively process nested objects and arrays
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      // Pass down the current element name for nested objects
      updateMultilingualTexts(value, translationsMap, currentElementName, results)
    }
  }

  return results
}

/**
 * Upload file to Google Cloud Storage
 */
async function uploadToGCS(filePath, fileName) {
  try {
    const storage = new Storage()
    const bucket = storage.bucket(BUCKET_NAME)
    console.log(`☁️  Uploading ${fileName} to gs://${BUCKET_NAME}/...`)

    const [file] = await bucket.upload(filePath, {
      destination: fileName,
      metadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=3600'
      }
    })

    console.log(`✅ Successfully uploaded ${fileName} to Google Cloud Storage`)
    return true
  } catch (error) {
    console.error(`❌ Failed to upload ${fileName}:`, error.message)
    return false
  }
}

/**
 * Import translations for a single survey
 */
async function importSurveyTranslations(csvFilePath, shouldUpload = false) {
  const csvFileName = path.basename(csvFilePath)
  const jsonFileName = SURVEY_CSV_MAPPING[csvFileName]

  if (!jsonFileName) {
    console.error(`❌ Unknown CSV file: ${csvFileName}`)
    console.log(`   Expected one of: ${Object.keys(SURVEY_CSV_MAPPING).join(', ')}`)
    return null
  }

  const surveyName = jsonFileName.replace('.json', '')
  const jsonFilePath = path.join(projectRoot, 'surveys', jsonFileName)

  console.log(`🔍 Processing: ${csvFileName} → ${jsonFileName}`)

  // Read and parse CSV
  if (!fs.existsSync(csvFilePath)) {
    console.error(`❌ CSV file not found: ${csvFilePath}`)
    return null
  }

  const csvContent = fs.readFileSync(csvFilePath, 'utf8')
  const translations = parseCSV(csvContent)

  if (translations.length === 0) {
    console.log(`⚠️  No translations found in ${csvFileName}`)
    return null
  }

  // Group translations by element name
  const translationsMap = {}
  translations.forEach(t => {
    if (!translationsMap[t.elementName]) {
      translationsMap[t.elementName] = []
    }
    translationsMap[t.elementName].push(t)
  })

  console.log(`🎯 Found translations for ${Object.keys(translationsMap).length} unique elements`)

  // Read original survey JSON
  if (!fs.existsSync(jsonFilePath)) {
    console.error(`❌ Survey JSON not found: ${jsonFilePath}`)
    return null
  }

  const surveyData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'))

  // Update survey with translations
  console.log(`🔄 Updating ${surveyName} with ${translations.length} translations...`)
  const results = updateMultilingualTexts(surveyData, translationsMap)

  const updatedCount = results.filter(r => r.updated).length
  const failedCount = results.filter(r => !r.updated).length

  // Save updated survey
  const outputFileName = `${surveyName}_updated.json`
  const outputPath = path.join(projectRoot, 'surveys', outputFileName)
  fs.writeFileSync(outputPath, JSON.stringify(surveyData, null, 2), 'utf8')

  let uploadSuccess = false
  if (shouldUpload) {
    uploadSuccess = await uploadToGCS(outputPath, jsonFileName)
  }

  console.log(`✅ ${surveyName}: Updated ${updatedCount} objects, saved to surveys/${outputFileName}`)
  if (failedCount > 0) {
    console.log(`⚠️  ${surveyName}: Failed to update ${failedCount} objects`)
  }

  return {
    surveyName,
    csvFile: csvFileName,
    jsonFile: jsonFileName,
    translationsCount: translations.length,
    updatedCount,
    failedCount,
    outputFile: outputFileName,
    uploaded: shouldUpload ? uploadSuccess : false
  }
}

/**
 * Import translations from all survey CSV files
 */
async function importAllSurveys(shouldUpload = false) {
  const surveysDir = path.join(projectRoot, 'surveys')
  const results = []

  console.log('🌍 Processing all survey translation files...\n')

  for (const [csvFile, jsonFile] of Object.entries(SURVEY_CSV_MAPPING)) {
    const csvPath = path.join(surveysDir, csvFile)

    if (fs.existsSync(csvPath)) {
      const result = await importSurveyTranslations(csvPath, shouldUpload)
      if (result) {
        results.push(result)
      }
      console.log() // Add spacing between surveys
    } else {
      console.log(`⚠️  Skipping ${csvFile} (file not found)`)
    }
  }

  return results
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2)
  const shouldUpload = args.includes('--upload')
  const processAll = args.includes('--all')

  console.log('🔄 Individual Survey Translation Import Tool')
  console.log('='.repeat(50))
  console.log(`📦 Target bucket: gs://${BUCKET_NAME}`)
  console.log(`☁️  Upload mode: ${shouldUpload ? 'ENABLED' : 'LOCAL ONLY'}\n`)

  let results = []

  if (processAll) {
    results = await importAllSurveys(shouldUpload)
  } else {
    const csvFile = args.find(arg => !arg.startsWith('--'))

    if (!csvFile) {
      console.log('❌ No CSV file specified')
      console.log('\nUsage:')
      console.log('  node scripts/import-individual-translations.js <csv-file> [--upload]')
      console.log('  node scripts/import-individual-translations.js --all [--upload]')
      console.log('\nExamples:')
      console.log('  node scripts/import-individual-translations.js surveys/parent_survey_family_translations.csv')
      console.log('  node scripts/import-individual-translations.js --all --upload')
      process.exit(1)
    }

    const csvPath = path.resolve(projectRoot, csvFile)
    const result = await importSurveyTranslations(csvPath, shouldUpload)
    if (result) {
      results.push(result)
    }
  }

  // Print summary
  if (results.length > 0) {
    console.log('\n📊 Import Summary:')
    results.forEach(result => {
      const status = shouldUpload ? (result.uploaded ? '(uploaded)' : '(upload failed)') : '(local only)'
      console.log(`  ✅ ${result.surveyName}: ${result.updatedCount} updates → surveys/${result.outputFile} ${status}`)
    })

    const totalUpdates = results.reduce((sum, r) => sum + r.updatedCount, 0)
    const totalTranslations = results.reduce((sum, r) => sum + r.translationsCount, 0)
    const uploadedCount = results.filter(r => r.uploaded).length

    console.log(`\n🎉 Total: ${totalUpdates} multilingual objects updated from ${totalTranslations} translations across ${results.length} surveys`)
    if (shouldUpload) {
      console.log(`☁️  Cloud uploads: ${uploadedCount}/${results.length} successful`)
    }
  } else {
    console.log('❌ No surveys were processed successfully')
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { importSurveyTranslations, importAllSurveys }
