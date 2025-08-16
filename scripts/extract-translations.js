#!/usr/bin/env node

/**
 * Script to extract translations from survey JSON files and generate CSV files
 *
 * Usage:
 *   node scripts/extract-translations.js <survey-file> [output-file]
 *
 * Examples:
 *   node scripts/extract-translations.js surveys/child_survey.json
 *   node scripts/extract-translations.js surveys/child_survey.json child_survey_translations.csv
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  SUPPORTED_LANGUAGES,
  JSON_LANGUAGE_MAPPING,
  isValidJsonLanguageKey
} from '../src/constants/languages.js'

// Get current directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

/**
 * Check if an object contains multilingual text
 */
function isMultilingualObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false
  }

  // Check if it has language keys
  const keys = Object.keys(obj)
  return keys.some(key => isValidJsonLanguageKey(key))
}

/**
 * Extract text from a multilingual object for all languages
 */
function extractTextFromMultilingualObject(obj) {
  const result = {}

  // Initialize all languages as empty
  SUPPORTED_LANGUAGES.forEach(lang => {
    result[lang] = ''
  })

  // Extract text for each available language
  for (const [key, value] of Object.entries(obj)) {
    if (isValidJsonLanguageKey(key)) {
      const targetLanguage = JSON_LANGUAGE_MAPPING[key]
      if (SUPPORTED_LANGUAGES.includes(targetLanguage)) {
        result[targetLanguage] = String(value || '').trim()
      }
    }
  }

  return result
}

/**
 * Recursively find all multilingual text objects in a survey
 */
function findMultilingualTexts(obj, currentPath = '', elementName = '', results = []) {
  if (!obj || typeof obj !== 'object') {
    return results
  }

  // If this is a multilingual object, extract it
  if (isMultilingualObject(obj)) {
    const texts = extractTextFromMultilingualObject(obj)

    // Only add if there's actually text content
    if (Object.values(texts).some(text => text.length > 0)) {
      results.push({
        path: currentPath,
        elementName: elementName,
        texts: texts
      })
    }
    return results
  }

  // Recursively search through object properties
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const newPath = currentPath ? `${currentPath}[${index}]` : `[${index}]`

      // Try to get element name from the item if it exists
      let newElementName = elementName
      if (item && typeof item === 'object' && item.name) {
        newElementName = item.name
      }

      findMultilingualTexts(item, newPath, newElementName, results)
    })
  } else {
    for (const [key, value] of Object.entries(obj)) {
      const newPath = currentPath ? `${currentPath}.${key}` : key

      // Update element name if we encounter a 'name' property
      let newElementName = elementName
      if (key === 'name' && typeof value === 'string') {
        newElementName = value
      }

      findMultilingualTexts(value, newPath, newElementName, results)
    }
  }

  return results
}

/**
 * Generate CSV content from extracted translations
 */
function generateCSV(translations, surveyName) {
  const lines = []

  // CSV Header
  const header = ['item_id', 'labels', ...SUPPORTED_LANGUAGES].join(',')
  lines.push(header)

  // CSV Rows
  translations.forEach((translation, index) => {
    const itemId = `${surveyName}_${String(index + 1).padStart(3, '0')}`
    const elementName = translation.elementName || 'unknown'

    // Escape CSV values (handle quotes and commas)
    const escapeCSV = (value) => {
      if (!value) return ''
      const stringValue = String(value)
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`
      }
      return stringValue
    }

    const row = [
      itemId,
      escapeCSV(elementName),
      ...SUPPORTED_LANGUAGES.map(lang => escapeCSV(translation.texts[lang]))
    ].join(',')

    lines.push(row)
  })

  return lines.join('\n')
}

/**
 * Main extraction function
 */
async function extractTranslations(inputFile, outputFile) {
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
    const surveyName = path.basename(inputFile, '.json').replace(/_survey$/, '_survey')

    console.log(`📝 Extracting translations from ${surveyName}...`)

    // Find all multilingual texts
    const translations = findMultilingualTexts(surveyData)

    console.log(`✅ Found ${translations.length} translatable text items`)

    // Log some examples
    if (translations.length > 0) {
      console.log('📋 Sample translations found:')
      translations.slice(0, 3).forEach((trans, i) => {
        console.log(`  ${i + 1}. [${trans.elementName}] ${trans.texts.en.substring(0, 50)}...`)
      })
    }

    // Generate CSV
    const csvContent = generateCSV(translations, surveyName)

        // Determine output file path
    const outputPath = outputFile
      ? path.resolve(projectRoot, outputFile)
      : path.resolve(projectRoot, 'surveys', `${surveyName}_translations.csv`)

    // Write CSV file
    fs.writeFileSync(outputPath, csvContent, 'utf8')

    console.log(`💾 Saved translations to: ${path.relative(projectRoot, outputPath)}`)
    console.log(`📊 Generated ${translations.length} translation rows`)

    // Show language coverage
    const languageCounts = {}
    SUPPORTED_LANGUAGES.forEach(lang => {
      languageCounts[lang] = translations.filter(t => t.texts[lang].length > 0).length
    })

    console.log('🌍 Language coverage:')
    Object.entries(languageCounts).forEach(([lang, count]) => {
      const percentage = translations.length > 0 ? Math.round((count / translations.length) * 100) : 0
      console.log(`  ${lang.toUpperCase()}: ${count}/${translations.length} (${percentage}%)`)
    })

  } catch (error) {
    console.error('❌ Error extracting translations:', error.message)
    process.exit(1)
  }
}

// CLI interface
function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
📋 Translation Extraction Tool

Usage:
  node scripts/extract-translations.js <survey-file> [output-file]

Examples:
  node scripts/extract-translations.js surveys/child_survey.json
  # → outputs to: surveys/child_survey_translations.csv

  node scripts/extract-translations.js surveys/child_survey.json custom_output.csv
  # → outputs to: custom_output.csv

  # Extract all surveys:
  node scripts/extract-translations.js surveys/parent_survey_family.json
  node scripts/extract-translations.js surveys/parent_survey_child.json
  node scripts/extract-translations.js surveys/teacher_survey_general.json

Arguments:
  survey-file    Path to the survey JSON file (required)
  output-file    Path for the output CSV file (optional, defaults to surveys/{survey_name}_translations.csv)

Supported Languages: ${SUPPORTED_LANGUAGES.join(', ')}
`)
    process.exit(0)
  }

  const inputFile = args[0]
  const outputFile = args[1]

  extractTranslations(inputFile, outputFile)
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { extractTranslations, findMultilingualTexts, generateCSV }
