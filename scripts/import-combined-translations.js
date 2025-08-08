#!/usr/bin/env node

/**
 * Script to import translations from a combined CSV file (like surveys.csv from Crowdin)
 * and update multiple survey JSON files based on the prefix in the identifier column
 *
 * Usage:
 *   node scripts/import-combined-translations.js <csv-file> [output-directory]
 *
 * Examples:
 *   node scripts/import-combined-translations.js surveys/surveys.csv
 *   node scripts/import-combined-translations.js surveys/surveys.csv surveys/updated/
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Storage } from '@google-cloud/storage'

// Get current directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// Google Cloud Storage configuration
const BUCKET_NAME = process.env.VITE_FIREBASE_PROJECT === 'DEV'
  ? 'levante-dashboard-dev'
  : 'road-dashboard'

// Supported languages mapping (CSV format to survey JSON format)
const LANGUAGE_MAPPING = {
  'en': 'default', // Map en back to default for JSON
  'es-CO': 'es',   // CSV uses es-CO, surveys use es
  'de': 'de',
  'fr-CA': 'fr',   // CSV uses fr-CA, surveys use fr
  'nl': 'nl'
}

// Survey file mapping
const SURVEY_FILES = {
  'child_survey': 'child_survey.json',
  'parent_survey_child': 'parent_survey_child.json',
  'parent_survey_family': 'parent_survey_family.json',
  'teacher_survey_general': 'teacher_survey_general.json',
  'teacher_survey_classroom': 'teacher_survey_classroom.json'
}

/**
 * Parse CSV content and pair numbered IDs with their element names
 */
function parseCSV(csvContent) {
  const lines = csvContent.trim().split('\n')
  if (lines.length === 0) {
    return []
  }

  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))

  // Parse data rows and pair numbered IDs with element names
  const data = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    // Parse CSV line handling quoted values
    const values = []
    let currentValue = ''
    let inQuotes = false
    let j = 0

    while (j < line.length) {
      const char = line[j]
      const nextChar = line[j + 1]

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          currentValue += '"'
          j += 2
        } else {
          // Toggle quote state
          inQuotes = !inQuotes
          j++
        }
      } else if (char === ',' && !inQuotes) {
        // End of value
        values.push(currentValue.trim())
        currentValue = ''
        j++
      } else {
        currentValue += char
        j++
      }
    }

    // Add final value
    values.push(currentValue.trim())

    // Create object from headers and values
    if (values.length === headers.length) {
      const row = {}
      headers.forEach((header, index) => {
        row[header] = values[index] || ''
      })

            // Only include rows with actual translation content (not just element names)
      if (row.identifier && row.identifier.match(/^[a-z_]+_\d+$/) && (row.en || row['es-CO'] || row.de)) {

        // Method 1: Check if element name is in the labels column (parent surveys)
        if (row.labels && row.labels.trim() && !row.labels.match(/^[a-z_]+_\d+$/)) {
          row.elementName = row.labels.trim()
        }
        // Method 2: Look ahead for element name on next line (child survey)
        else if (i + 1 < lines.length) {
          const nextLine = lines[i + 1]
          const nextValues = nextLine.split(',')
          const elementName = nextValues[0] ? nextValues[0].trim().replace(/"/g, '') : ''

          // If next line looks like an element name (not numbered), add it
          if (elementName && !elementName.match(/^[a-z_]+_\d+$/)) {
            row.elementName = elementName
          }
        }

        data.push(row)
      }
    }
  }

  return data
}

/**
 * Determine which survey a translation row belongs to based on identifier
 */
function getSurveyFromIdentifier(identifier) {
  if (!identifier) return null

  // Check for numbered identifiers first (e.g., child_survey_001)
  const numberedMatch = identifier.match(/^([a-z_]+_survey(?:_[a-z]+)?)_\d+$/)
  if (numberedMatch) {
    return numberedMatch[1]
  }

  // For element names, we need to map them to surveys based on content
  // This is more complex and might require lookup in the original survey files
  // For now, return null for element names without numbered prefixes
  return null
}

/**
 * Group translations by survey
 */
function groupTranslationsBySurvey(translations) {
  const grouped = {}
  const unmapped = []

  translations.forEach(translation => {
    const survey = getSurveyFromIdentifier(translation.identifier)

    if (survey) {
      if (!grouped[survey]) {
        grouped[survey] = []
      }
      grouped[survey].push(translation)
    } else {
      unmapped.push(translation)
    }
  })

  return { grouped, unmapped }
}

/**
 * Check if an object contains multilingual text
 */
function isMultilingualObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false
  }

  const keys = Object.keys(obj)
  const multilingualKeys = ['default', 'en', 'es', 'de', 'fr', 'nl']
  return keys.some(key => multilingualKeys.includes(key))
}

/**
 * Extract element name from identifier and context
 */
function getElementNameFromIdentifier(identifier, context) {
  // If context contains the element name on the second line, use it
  if (context && context.trim()) {
    const lines = context.split('\n').map(line => line.trim()).filter(line => line)
    // The element name is typically on the second line after the numbered ID
    if (lines.length >= 2) {
      const elementName = lines[1]
      // Make sure it doesn't look like a numbered ID
      if (elementName && !elementName.match(/^[a-z_]+_\d+$/)) {
        return elementName
      }
    }
    // Fallback: look for any line that doesn't contain underscores and numbers
    const elementLine = lines.find(line => line && !line.includes('_') && !line.match(/^\d+$/))
    if (elementLine) {
      return elementLine
    }
  }

  // For identifiers that are already element names (not numbered)
  if (identifier && !identifier.match(/^[a-z_]+_\d+$/)) {
    return identifier
  }

  return null
}

/**
 * Recursively find and update multilingual objects in survey JSON
 */
function updateMultilingualTexts(obj, translationsMap, elementName = '', results = []) {
  if (!obj || typeof obj !== 'object') {
    return results
  }

  // If this is a multilingual object, update it
  if (isMultilingualObject(obj)) {
    // Try to find matching translations
    const matchingTranslations = translationsMap[elementName] || []

    if (matchingTranslations.length > 0) {
      // Find the best matching translation by comparing English text
      const currentEnglishText = obj.default || obj.en || ''
      let bestMatch = null

      // For single translation, use it directly
      if (matchingTranslations.length === 1) {
        bestMatch = matchingTranslations[0]
            } else {
        // For multiple translations, find exact text match
        bestMatch = matchingTranslations.find(t => {
          const translationEnText = t.en || ''
          return translationEnText.trim() === currentEnglishText.trim()
        })

        // Don't use fallback if no exact match found - this prevents corruption
        // bestMatch will remain null if no exact match is found
      }

      if (bestMatch) {
        // Update each language if translation exists
        for (const [csvLang, jsonLang] of Object.entries(LANGUAGE_MAPPING)) {
          if (bestMatch[csvLang] && bestMatch[csvLang].trim()) {
            obj[jsonLang] = bestMatch[csvLang].trim()
          }
        }

        results.push({
          elementName,
          updated: true,
          translation: bestMatch,
          matchType: matchingTranslations.length === 1 ? 'single' : 'exact_text'
        })
      } else {
        results.push({
          elementName,
          updated: false,
          reason: 'No suitable translation match found'
        })
      }
    } else {
      results.push({
        elementName,
        updated: false,
        reason: 'No matching translation found'
      })
    }

    return results
  }

  // Recursively search through object properties
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      let newElementName = elementName
      if (item && typeof item === 'object' && item.name) {
        newElementName = item.name
      }

      updateMultilingualTexts(item, translationsMap, newElementName, results)
    })
  } else {
    for (const [key, value] of Object.entries(obj)) {
      let newElementName = elementName
      if (key === 'name' && typeof value === 'string') {
        newElementName = value
      }

      updateMultilingualTexts(value, translationsMap, newElementName, results)
    }
  }

  return results
}

/**
 * Upload file to Google Cloud Storage
 */
async function uploadToGCS(filePath, fileName) {
  try {
    // Initialize Google Cloud Storage
    const storage = new Storage()
    const bucket = storage.bucket(BUCKET_NAME)

    console.log(`☁️  Uploading ${fileName} to gs://${BUCKET_NAME}/...`)

    // Upload file
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
async function importSurveyTranslations(surveyKey, translations, outputDir, shouldUpload = false) {
  try {
    const surveyFileName = SURVEY_FILES[surveyKey]
    if (!surveyFileName) {
      console.warn(`⚠️  Unknown survey key: ${surveyKey}`)
      return null
    }

    const surveyPath = path.resolve(projectRoot, 'surveys', surveyFileName)
    if (!fs.existsSync(surveyPath)) {
      console.warn(`⚠️  Survey file not found: ${surveyPath}`)
      return null
    }

    console.log(`🔍 Reading survey: ${surveyFileName}`)

    // Read and parse the survey JSON
    const surveyContent = fs.readFileSync(surveyPath, 'utf8')
    const surveyData = JSON.parse(surveyContent)

    // Create translations map grouped by element name
    const translationsMap = {}
    translations.forEach(translation => {
      const elementName = translation.elementName || getElementNameFromIdentifier(translation.identifier, translation.context)

      if (elementName) {
        if (!translationsMap[elementName]) {
          translationsMap[elementName] = []
        }
        translationsMap[elementName].push(translation)
      }
    })

    console.log(`🔄 Updating ${surveyKey} with ${translations.length} translations...`)

    // Update the survey data
    const updateResults = updateMultilingualTexts(surveyData, translationsMap)

    // Count successful updates
    const successfulUpdates = updateResults.filter(r => r.updated).length
    const failedUpdates = updateResults.filter(r => !r.updated).length

    // Determine output file path
    const outputPath = outputDir
      ? path.resolve(projectRoot, outputDir, `${surveyKey}_updated.json`)
      : path.resolve(projectRoot, 'surveys', `${surveyKey}_updated.json`)

    // Ensure output directory exists
    const outputDirPath = path.dirname(outputPath)
    if (!fs.existsSync(outputDirPath)) {
      fs.mkdirSync(outputDirPath, { recursive: true })
    }

    // Write updated JSON
    const updatedJsonContent = JSON.stringify(surveyData, null, 2)
    fs.writeFileSync(outputPath, updatedJsonContent, 'utf8')

        console.log(`✅ ${surveyKey}: Updated ${successfulUpdates} objects, saved to ${path.relative(projectRoot, outputPath)}`)

    if (failedUpdates > 0) {
      console.log(`⚠️  ${surveyKey}: Failed to update ${failedUpdates} objects`)
    }

    const result = {
      surveyKey,
      successful: successfulUpdates,
      failed: failedUpdates,
      outputPath: path.relative(projectRoot, outputPath),
      uploaded: false
    }

    // Upload to Google Cloud Storage if requested
    if (shouldUpload && successfulUpdates > 0) {
      const originalFileName = SURVEY_FILES[surveyKey]
      const uploaded = await uploadToGCS(outputPath, originalFileName)
      result.uploaded = uploaded

      if (uploaded) {
        console.log(`☁️  ${surveyKey}: Uploaded as ${originalFileName} to ${BUCKET_NAME}`)
      }
    }

    return result

  } catch (error) {
    console.error(`❌ Error processing ${surveyKey}:`, error.message)
    return null
  }
}

/**
 * Main import function
 */
async function importCombinedTranslations(csvFile, outputDir, shouldUpload = false) {
  try {
    console.log(`🔍 Reading combined CSV file: ${csvFile}`)

    // Read and parse the CSV
    const csvPath = path.resolve(projectRoot, csvFile)
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found: ${csvPath}`)
    }

    const csvContent = fs.readFileSync(csvPath, 'utf8')
    const allTranslations = parseCSV(csvContent)

    console.log(`📋 Parsed ${allTranslations.length} total translation rows`)

    // Group translations by survey
    const { grouped, unmapped } = groupTranslationsBySurvey(allTranslations)

    console.log(`🎯 Found translations for ${Object.keys(grouped).length} surveys:`)
    Object.entries(grouped).forEach(([survey, translations]) => {
      console.log(`  - ${survey}: ${translations.length} items`)
    })

    if (unmapped.length > 0) {
      console.log(`⚠️  ${unmapped.length} translations could not be mapped to surveys`)
    }

    // Process each survey
    const results = []
    for (const [surveyKey, translations] of Object.entries(grouped)) {
      const result = await importSurveyTranslations(surveyKey, translations, outputDir, shouldUpload)
      if (result) {
        results.push(result)
      }
    }

        // Summary
    console.log('\n📊 Import Summary:')
    results.forEach(result => {
      const uploadStatus = result.uploaded ? '☁️  uploaded' : (shouldUpload ? '❌ upload failed' : 'local only')
      console.log(`  ✅ ${result.surveyKey}: ${result.successful} updates → ${result.outputPath} (${uploadStatus})`)
    })

    const totalUpdates = results.reduce((sum, r) => sum + r.successful, 0)
    const totalUploaded = results.filter(r => r.uploaded).length

    console.log(`\n🎉 Total: ${totalUpdates} multilingual objects updated across ${results.length} surveys`)

    if (shouldUpload) {
      console.log(`☁️  Cloud Storage: ${totalUploaded}/${results.length} surveys uploaded to gs://${BUCKET_NAME}`)
    }

  } catch (error) {
    console.error('❌ Error importing combined translations:', error.message)
    process.exit(1)
  }
}

// CLI interface
function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
📥 Combined Translation Import Tool

Imports translations from a single CSV file containing multiple surveys
and updates the corresponding survey JSON files.

Usage:
  node scripts/import-combined-translations.js <csv-file> [output-directory] [--upload]

Examples:
  node scripts/import-combined-translations.js surveys/surveys.csv
  # → outputs to: surveys/{survey_name}_updated.json

  node scripts/import-combined-translations.js surveys/surveys.csv surveys/updated/
  # → outputs to: surveys/updated/{survey_name}_updated.json

  node scripts/import-combined-translations.js surveys/surveys.csv --upload
  # → outputs to surveys/ AND uploads to Google Cloud Storage

Arguments:
  csv-file           Path to the combined CSV file (required)
  output-directory   Directory for output files (optional, defaults to surveys/)
  --upload           Upload updated files to Google Cloud Storage bucket

Environment Variables:
  VITE_FIREBASE_PROJECT=DEV    → uploads to levante-dashboard-dev
  VITE_FIREBASE_PROJECT!=DEV   → uploads to road-dashboard

Supported Surveys: ${Object.keys(SURVEY_FILES).join(', ')}
CSV Format: identifier,labels,en,es-CO,de,fr-CA,nl,context
`)
    process.exit(0)
  }

  const csvFile = args[0]
  const shouldUpload = args.includes('--upload')
  const outputDir = args.find((arg, index) => index > 0 && !arg.startsWith('--'))

  importCombinedTranslations(csvFile, outputDir, shouldUpload)
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { importCombinedTranslations, groupTranslationsBySurvey, parseCSV }
