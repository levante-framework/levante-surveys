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
      const hasTranslationContent = headers.some(header => {
        const isLangCol = /^([a-z]{2})(?:-[A-Z]{2})?$/.test(header) || header === 'en'
        return isLangCol && row[header] && row[header].trim()
      })
      if (row.identifier && row.identifier.trim() && hasTranslationContent) {
        // Use identifier directly as element name
        row.elementName = row.identifier.trim()
        data.push(row)
      }
    }
  }

  return data
}

/**
 * Determine which survey a translation row belongs to based on identifier
 */
function getSurveyFromIdentifier(identifier, labels) {
  if (!identifier) return null

  // Check for numbered identifiers first (e.g., child_survey_001) - legacy support
  const numberedMatch = identifier.match(/^([a-z_]+_survey(?:_[a-z]+)?)_\d+$/)
  if (numberedMatch) {
    return numberedMatch[1]
  }

  // Check if labels column contains survey name
  if (labels && labels.trim() && labels.includes('_survey')) {
    return labels.trim()
  }

  // For element names without survey prefixes, we can't determine the survey
  // Return null and let the import process handle all translations for all surveys
  return null
}

/**
 * Group translations by survey
 */
function groupTranslationsBySurvey(translations) {
  const grouped = {}
  const unmapped = []

  translations.forEach(translation => {
    const survey = getSurveyFromIdentifier(translation.identifier, translation.labels)

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
  return keys.some(key => isValidJsonLanguageKey(key))
}

/** Normalize text for matching: strip HTML, entities, collapse whitespace, lowercase */
function normalizeForMatch(text) {
  if (!text) return ''
  let t = String(text)
  t = t.replace(/<br\s*\/?>/gi, ' ')
  t = t.replace(/<[^>]+>/g, '')
  t = t.replace(/&nbsp;/gi, ' ')
  t = t.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
  t = t.replace(/\s+/g, ' ').trim().toLowerCase()
  return t
}

/**
 * Extract element name from identifier
 */
function getElementNameFromIdentifier(identifier) {
  // Identifier now directly contains the element name
  return identifier && identifier.trim() ? identifier.trim() : null
}

/**
 * Recursively find and update multilingual objects in survey JSON
 */
function updateMultilingualTexts(obj, maps, elementName = '', results = []) {
  const langMap = maps.langMap || CSV_TO_JSON_MAPPING
  if (!obj || typeof obj !== 'object') {
    return results
  }

  // If this is a multilingual object, update it
  if (isMultilingualObject(obj)) {
    const byElement = maps.byElement || {}
    const byElementAndEn = maps.byElementAndEn || {}

    // Gather candidates by element name
    const candidates = byElement[elementName] || []

    if (candidates.length > 0) {
      const currentEnglishText = normalizeForMatch(obj.default || obj.en)
      const exactKey = `${elementName}||${currentEnglishText}`

      // Prefer exact English text match when multiple options exist
      let bestMatch = null
      if (candidates.length === 1) {
        bestMatch = candidates[0]
      } else if (currentEnglishText) {
        // Build a map with normalized English for lookup if not present
        if (!byElementAndEn[exactKey]) {
          for (const c of candidates) {
            const k = `${elementName}||${normalizeForMatch(c.en)}`
            if (!byElementAndEn[k]) byElementAndEn[k] = c
          }
        }
        bestMatch = byElementAndEn[exactKey] || null
      }

      if (bestMatch) {
        for (const [csvLang, jsonLang] of Object.entries(langMap)) {
          const v = bestMatch[csvLang]
          if (v && String(v).trim()) {
            obj[jsonLang] = String(v).trim()
          }
        }
        results.push({ elementName, updated: true, translation: bestMatch, matchType: candidates.length === 1 ? 'single' : 'exact_text' })
      } else {
        results.push({ elementName, updated: false, reason: 'No suitable translation match found' })
      }
    } else {
      results.push({ elementName, updated: false, reason: 'No matching translation found' })
    }

    return results
  }

  // Recursively search through object properties
  if (Array.isArray(obj)) {
    obj.forEach((item) => {
      let newElementName = elementName
      if (item && typeof item === 'object' && item.name) {
        newElementName = item.name
      }
      updateMultilingualTexts(item, maps, newElementName, results)
    })
  } else {
    for (const [key, value] of Object.entries(obj)) {
      let newElementName = elementName
      if (key === 'name' && typeof value === 'string') {
        newElementName = value
      }
      updateMultilingualTexts(value, maps, newElementName, results)
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

    console.log(`☁️  Uploading ${fileName} to gs://${BUCKET_NAME}/surveys/...`)

    // Upload file
    await bucket.upload(filePath, {
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

    // Create translations maps:
    // 1) by elementName + English text (exact match)
    // 2) by elementName (fallback when there is only one)
    const translationsMapByElementAndEn = {}
    const translationsMapByElement = {}

    translations.forEach(translation => {
      const elementName = translation.elementName || getElementNameFromIdentifier(translation.identifier)
      if (!elementName) return

      if (!translationsMapByElement[elementName]) {
        translationsMapByElement[elementName] = []
      }
      translationsMapByElement[elementName].push(translation)

      const enText = normalizeForMatch(translation.en)
      const key = `${elementName}||${enText}`
      translationsMapByElementAndEn[key] = translation
    })

    console.log(`🔄 Updating ${surveyKey} with ${translations.length} translations...`)

    // Derive language mapping dynamically from CSV columns present in translations
    const sample = translations.find(t => !!t) || {}
    const langMap = {}
    Object.keys(sample).forEach(col => {
      if (!col) return
      const isMeta = ['identifier', 'labels', 'elementName', 'context'].includes(col)
      if (isMeta) return

      // Use the centralized CSV_TO_JSON_MAPPING for language code conversion
      if (CSV_TO_JSON_MAPPING[col]) {
        langMap[col] = CSV_TO_JSON_MAPPING[col]
      } else {
        // Fallback for unmapped language codes
        const isLang = /^([a-z]{2})(?:[-_][A-Z]{2})?$/.test(col) || col === 'en'
        if (isLang) {
          if (col === 'en') {
            langMap[col] = 'default'
          } else {
            // Convert to standardized format (hyphens, not underscores)
            langMap[col] = col.toLowerCase().replace('_', '-')
          }
        }
      }
    })

    // Update the survey data
    const updateResults = updateMultilingualTexts(surveyData, { byElement: translationsMapByElement, byElementAndEn: translationsMapByElementAndEn, langMap })

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

    // Try to group translations by survey first
    const { grouped, unmapped } = groupTranslationsBySurvey(allTranslations)

    console.log(`🎯 Found translations for ${Object.keys(grouped).length} surveys:`)
    Object.entries(grouped).forEach(([survey, translations]) => {
      console.log(`  - ${survey}: ${translations.length} items`)
    })

    if (unmapped.length > 0) {
      console.log(`⚠️  ${unmapped.length} translations could not be mapped to surveys`)
    }

    // Process grouped translations first
    const results = []
    for (const [surveyKey, translations] of Object.entries(grouped)) {
      const result = await importSurveyTranslations(surveyKey, translations, outputDir, shouldUpload)
      if (result && result.successful > 0) {
        results.push(result)
      }
    }

    // If we have unmapped translations, try them against all surveys
    if (unmapped.length > 0) {
      console.log(`\n🔄 Processing ${unmapped.length} unmapped translations against all surveys...`)
      for (const surveyKey of Object.keys(SURVEY_FILES)) {
        // Skip if we already processed this survey
        if (grouped[surveyKey]) continue

        const result = await importSurveyTranslations(surveyKey, unmapped, outputDir, shouldUpload)
        if (result && result.successful > 0) {
          results.push(result)
        }
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
