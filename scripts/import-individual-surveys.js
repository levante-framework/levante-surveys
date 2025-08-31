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
const BUCKET_NAME = 'levante-assets-dev'

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
 * Convert underscore format language codes to hyphen format throughout the survey
 */
function convertUnderscoreToHyphenFormat(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj
  }

  // Language code mapping from underscore to hyphen format
  const underscoreMapping = {
    'es_co': 'es-CO',
    'es_ar': 'es-AR',
    'de_ch': 'de-CH',
    'fr_ca': 'fr-CA',
    'en_us': 'en-US',
    'en_gb': 'en-GB',
    'en_gh': 'en-GH'
  }

  if (Array.isArray(obj)) {
    return obj.map(item => convertUnderscoreToHyphenFormat(item))
  }

  const converted = {}
  for (const [key, value] of Object.entries(obj)) {
    // Convert language keys
    const newKey = underscoreMapping[key] || key
    converted[newKey] = convertUnderscoreToHyphenFormat(value)
  }

  return converted
}

/**
 * Recursively find and update multilingual objects in survey JSON
 */
function updateMultilingualTexts(obj, translationsMap, elementName = '', results = [], byElement = {}) {
  if (!obj || typeof obj !== 'object') {
    return results
  }

  // Check if this object has a 'name' property that we can use as elementName
  const currentElementName = obj.name || elementName

  // If this is a multilingual object, update it
  if (isMultilingualObject(obj)) {
    // Try to find matching translations using the current element name
    const englishBaseline = (obj.default || obj.en_us || obj.en || '').trim()
    let matchingTranslations = translationsMap[`${currentElementName}::${englishBaseline}`] || []

    // Context filter: if this multilingual is a title (no parent choices) and looks like a question
    // but the candidate translation row clearly looks like a long question (contains '?'), de-prioritize it
    if (matchingTranslations.length > 1 && Array.isArray(byElement[currentElementName])) {
      const baselineHasQ = /[?¿]/.test(englishBaseline)
      const filterFn = baselineHasQ
        ? (t) => /[?¿]/.test((t.source || t.en || '').trim())
        : (t) => !/[?¿]/.test((t.source || t.en || '').trim())
      const filtered = matchingTranslations.filter(filterFn)
      if (filtered.length > 0) matchingTranslations = filtered
    }

    if (matchingTranslations.length > 0) {
      // Find the best matching translation by comparing English text
      const currentEnglishText = (obj.default || obj.en_us || obj.en || '').trim()
      let bestMatch = null

      if (matchingTranslations.length === 1) {
        bestMatch = matchingTranslations[0]
      } else {
        // Try to find exact match by English/source text
        bestMatch = matchingTranslations.find(t => {
          const candidate = (t.source || t.en || t['en-US'] || t['en_US'] || '').trim()
          return candidate === currentEnglishText
        })
        // Don't use fallback if no exact match found - this prevents corruption
      }

      if (bestMatch) {
        // Update with Crowdin translations (avoid overwriting with English fallback)
        for (const [csvLang, jsonLang] of Object.entries(CSV_TO_JSON_MAPPING)) {
          // Never overwrite base English in JSON
          if (jsonLang === 'default') continue
          const val = bestMatch[csvLang]
          if (typeof val === 'string' && val.trim()) {
            // Only apply if it's a real translation, not English fallback
            const englishBaseline = (obj.default || obj.en || '').trim()
            const isEnglishFallback = val.trim() === englishBaseline ||
                                    val.trim() === (bestMatch.en || '').trim()

            // Don't overwrite existing translations with English fallback
            if (!isEnglishFallback || !obj[jsonLang]) {
              obj[jsonLang] = val.trim()
            }
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
  for (const [/* key */, value] of Object.entries(obj)) {
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
    console.log(`☁️  Uploading ${fileName} to gs://${BUCKET_NAME}/surveys/...`)

    const [/* file */] = await bucket.upload(filePath, {
      destination: `surveys/${fileName}`,
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
 * Update navigation texts (startSurveyText, pagePrevText, pageNextText, completeText)
 * These have 'unknown' identifier in CSV and need special handling
 */
function updateNavigationTexts(surveyData, translations) {
  const results = []

  // Map English navigation text to JSON field names
  const navigationMapping = {
    'Start Survey': 'startSurveyText',
    'Previous': 'pagePrevText',
    'Next': 'pageNextText',
    'Finish': 'completeText'
  }

    // Find navigation text translations (they have 'navigation.*' identifiers)
  const navigationTranslations = translations.filter(t =>
    t.elementName && t.elementName.startsWith('navigation.') && Object.keys(navigationMapping).includes((t.source || t.en || '').trim())
  )

  console.log(`🧭 Found ${navigationTranslations.length} navigation text translations`)

  navigationTranslations.forEach(navTrans => {
    const englishText = (navTrans.source || navTrans.en || '').trim()
    const fieldName = navigationMapping[englishText]

    if (fieldName && surveyData[fieldName]) {
      let updated = false

      // Update each language if translation exists
      for (const [csvLang, jsonLang] of Object.entries(CSV_TO_JSON_MAPPING)) {
        // Never overwrite base English in JSON
        if (jsonLang === 'default') continue

        const val = navTrans[csvLang]
        if (typeof val === 'string' && val.trim()) {
          // Initialize the navigation field if it doesn't exist
          if (!surveyData[fieldName]) {
            surveyData[fieldName] = {}
          }

          surveyData[fieldName][jsonLang] = val.trim()
          updated = true
        }
      }

      results.push({
        elementName: `navigation.${fieldName}`,
        updated,
        translation: navTrans,
        matchType: 'navigation'
      })

      if (updated) {
        console.log(`✅ Updated ${fieldName} navigation text`)
      }
    }
  })

  return results
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
  // Group by element AND by English/source text to avoid mixing identical labels of different choices
  const translationsMap = {}
  const byElement = {}
  translations.forEach(t => {
    const base = t.elementName
    const english = (t.source || t.en || t['en-US'] || t['en_US'] || '').trim()
    const key = `${base}::${english}`
    if (!translationsMap[key]) translationsMap[key] = []
    translationsMap[key].push(t)
    if (!byElement[base]) byElement[base] = []
    byElement[base].push(t)
  })

  console.log(`🎯 Found translations for ${Object.keys(translationsMap).length} unique elements`)

  // Read original survey JSON
  if (!fs.existsSync(jsonFilePath)) {
    console.error(`❌ Survey JSON not found: ${jsonFilePath}`)
    return null
  }

  let surveyData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'))

  // Convert underscore format language codes to hyphen format before processing
  surveyData = convertUnderscoreToHyphenFormat(surveyData)

  // Update survey with translations
  console.log(`🔄 Updating ${surveyName} with ${translations.length} translations...`)
  const results = updateMultilingualTexts(surveyData, translationsMap, '', [], byElement)

  // Handle navigation texts separately (they have 'unknown' identifier)
  const navigationResults = updateNavigationTexts(surveyData, translations)
  results.push(...navigationResults)

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

  for (const [csvFile, /* jsonFile */] of Object.entries(SURVEY_CSV_MAPPING)) {
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
