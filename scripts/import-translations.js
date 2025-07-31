#!/usr/bin/env node

/**
 * Script to import translations from GitHub CSV back into survey JSON files
 *
 * Usage:
 *   node scripts/import-translations.js <survey-file> [output-file]
 *
 * Examples:
 *   node scripts/import-translations.js surveys/child_survey.json
 *   node scripts/import-translations.js surveys/child_survey.json surveys/child_survey_updated.json
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import axios from 'axios'

// Get current directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// GitHub CSV URL for translations
const TRANSLATED_TEXT_URL = "https://raw.githubusercontent.com/levante-framework/levante_translations/l10n_pending/text/translated_prompts.csv"

// Supported languages mapping (GitHub CSV format to survey JSON format)
const LANGUAGE_MAPPING = {
  'en': 'default', // Map en back to default for JSON
  'es-CO': 'es',   // GitHub uses es-CO, surveys use es
  'de': 'de',
  'fr-CA': 'fr',   // GitHub uses fr-CA, surveys use fr
  'nl': 'nl'
}

/**
 * Parse CSV content into an array of objects
 */
function parseCSV(csvContent) {
  const lines = csvContent.trim().split('\n')
  if (lines.length === 0) {
    return []
  }

  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))

  // Parse data rows
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
      data.push(row)
    }
  }

  return data
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
      // Use the first matching translation
      const translation = matchingTranslations[0]

      // Update each language if translation exists
      for (const [csvLang, jsonLang] of Object.entries(LANGUAGE_MAPPING)) {
        if (translation[csvLang] && translation[csvLang].trim()) {
          obj[jsonLang] = translation[csvLang].trim()
        }
      }

      results.push({
        elementName,
        updated: true,
        translation
      })
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
 * Main import function
 */
async function importTranslations(inputFile, outputFile) {
  try {
    console.log(`🔍 Reading survey file: ${inputFile}`)

    // Read and parse the survey JSON
    const surveyPath = path.resolve(projectRoot, inputFile)
    if (!fs.existsSync(surveyPath)) {
      throw new Error(`Survey file not found: ${surveyPath}`)
    }

    const surveyContent = fs.readFileSync(surveyPath, 'utf8')
    const surveyData = JSON.parse(surveyContent)

    // Extract survey name from filename
    const surveyName = path.basename(inputFile, '.json')

    console.log(`📥 Fetching translations from GitHub for survey: ${surveyName}`)

    // Fetch translations CSV from GitHub
    const response = await axios.get(TRANSLATED_TEXT_URL, {
      timeout: 30000,
      headers: {
        'Accept': 'text/csv, text/plain'
      }
    })

    console.log(`✅ Downloaded translations CSV (${(response.data.length / 1024).toFixed(2)} KB)`)

    // Parse CSV
    const allTranslations = parseCSV(response.data)
    console.log(`📋 Parsed ${allTranslations.length} total translation rows`)

    // Filter translations for survey items only (labels = "survey")
    const surveyTranslations = allTranslations.filter(row =>
      row.labels && row.labels.trim().toLowerCase() === 'survey'
    )

    console.log(`🎯 Found ${surveyTranslations.length} survey translation items`)

    if (surveyTranslations.length === 0) {
      console.warn(`⚠️  No survey translations found`)
      console.log('Available labels in CSV:')
      const labels = [...new Set(allTranslations.map(row => row.labels || 'unknown'))]
      labels.slice(0, 10).forEach(label => console.log(`  - ${label}`))
      if (labels.length > 10) {
        console.log(`  ... and ${labels.length - 10} more`)
      }
      return
    }

    // Group translations by identifier (element name)
    const translationsMap = {}
    surveyTranslations.forEach(translation => {
      const elementName = translation.identifier // Use identifier as element name
      if (elementName && !translationsMap[elementName]) {
        translationsMap[elementName] = []
      }
      if (elementName) {
        translationsMap[elementName].push(translation)
      }
    })

    console.log(`🔄 Updating survey JSON with translations...`)

    // Update the survey data
    const updateResults = updateMultilingualTexts(surveyData, translationsMap)

    // Count successful updates
    const successfulUpdates = updateResults.filter(r => r.updated).length
    const failedUpdates = updateResults.filter(r => !r.updated).length

    console.log(`✅ Successfully updated ${successfulUpdates} multilingual objects`)
    if (failedUpdates > 0) {
      console.log(`⚠️  Failed to update ${failedUpdates} multilingual objects`)

      // Show some examples of failed updates
      const failures = updateResults.filter(r => !r.updated).slice(0, 5)
      if (failures.length > 0) {
        console.log('Examples of missing translations:')
        failures.forEach(failure => {
          console.log(`  - ${failure.elementName}: ${failure.reason}`)
        })
      }
    }

    // Determine output file path
    const outputPath = outputFile
      ? path.resolve(projectRoot, outputFile)
      : path.resolve(projectRoot, 'surveys', `${surveyName}_updated.json`)

    // Write updated JSON
    const updatedJsonContent = JSON.stringify(surveyData, null, 2)
    fs.writeFileSync(outputPath, updatedJsonContent, 'utf8')

    console.log(`💾 Saved updated survey to: ${path.relative(projectRoot, outputPath)}`)

    // Show language coverage from translations
    const languageCounts = {}
    const languages = ['en', 'es-CO', 'de', 'fr-CA', 'nl']
    languages.forEach(lang => {
      languageCounts[lang] = surveyTranslations.filter(t => t[lang] && t[lang].trim()).length
    })

    console.log('🌍 Translation coverage in CSV:')
    Object.entries(languageCounts).forEach(([lang, count]) => {
      const percentage = surveyTranslations.length > 0 ? Math.round((count / surveyTranslations.length) * 100) : 0
      console.log(`  ${lang.toUpperCase()}: ${count}/${surveyTranslations.length} (${percentage}%)`)
    })

  } catch (error) {
    console.error('❌ Error importing translations:', error.message)
    if (error.response) {
      console.error(`HTTP ${error.response.status}: ${error.response.statusText}`)
    }
    process.exit(1)
  }
}

// CLI interface
function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
📥 Translation Import Tool

Fetches translations from GitHub and updates survey JSON files.

Usage:
  node scripts/import-translations.js <survey-file> [output-file]

Examples:
  node scripts/import-translations.js surveys/child_survey.json
  # → outputs to: surveys/child_survey_updated.json

  node scripts/import-translations.js surveys/child_survey.json surveys/child_survey.json
  # → overwrites the original file

  # Import all surveys:
  node scripts/import-translations.js surveys/parent_survey_family.json
  node scripts/import-translations.js surveys/parent_survey_child.json
  node scripts/import-translations.js surveys/teacher_survey_general.json

Arguments:
  survey-file    Path to the survey JSON file (required)
  output-file    Path for the output JSON file (optional, defaults to surveys/{survey_name}_updated.json)

Translation Source: ${TRANSLATED_TEXT_URL}
Supported Languages: en, es-CO, de, fr-CA, nl
Note: Filters for items with labels = "survey"
`)
    process.exit(0)
  }

  const inputFile = args[0]
  const outputFile = args[1]

  importTranslations(inputFile, outputFile)
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { importTranslations, parseCSV, updateMultilingualTexts }
