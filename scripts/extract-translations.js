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
import { normalizeDefaultsFromValues } from './normalize-utils.js'
// No longer need language constants - using dynamic discovery

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
  return keys.some(key => isLanguageLikeKey(key))
}

/**
 * Check if a key looks like a language code (more permissive than isValidJsonLanguageKey)
 */
function isLanguageLikeKey(key) {
  // Match 'default', 2-letter codes, or 2-letter codes with country/region suffix
  return key === 'default' || /^[a-z]{2}(_[a-z]{2})?$/i.test(key)
}

/**
 * Discover all languages present in the survey data
 */
function discoverLanguagesInSurvey(obj, foundLanguages = new Set()) {
  if (!obj || typeof obj !== 'object') {
    return foundLanguages
  }

  if (Array.isArray(obj)) {
    obj.forEach(item => discoverLanguagesInSurvey(item, foundLanguages))
    return foundLanguages
  }

  // Check if this object has language-like keys
  const keys = Object.keys(obj)
  const hasLanguageKeys = keys.some(key => isLanguageLikeKey(key))

  if (hasLanguageKeys) {
    // This looks like a multilingual object
         keys.forEach(key => {
             if (isLanguageLikeKey(key)) {
        // Map 'default' to 'en' for CSV output, and standardize to hyphens
        let csvKey = key === 'default' ? 'en' : key
        // Convert underscores to hyphens and uppercase country codes (e.g., es_co -> es-CO, de_ch -> de-CH)
        if (csvKey.includes('_')) {
          const [lang, country] = csvKey.split('_')
          csvKey = `${lang}-${country.toUpperCase()}`
        }
        foundLanguages.add(csvKey)
      }
     })
  }

  // Recursively check all properties
  Object.values(obj).forEach(value => {
    discoverLanguagesInSurvey(value, foundLanguages)
  })

  return foundLanguages
}

/**
 * Extract text from a multilingual object for all languages
 */
function extractTextFromMultilingualObject(obj, availableLanguages) {
  const result = {}

  // Initialize all languages as empty
  availableLanguages.forEach(lang => {
    result[lang] = ''
  })

  // Extract text for each available language
  for (const [key, value] of Object.entries(obj)) {
    if (isLanguageLikeKey(key)) {
      // Map 'default' to 'source' for CSV output, and standardize to hyphens
      let csvKey = key === 'default' ? 'source' : key
      // Convert underscores to hyphens and uppercase country codes (e.g., es_co -> es-CO, de_ch -> de-CH)
      if (csvKey.includes('_')) {
        const [lang, country] = csvKey.split('_')
        csvKey = `${lang}-${country.toUpperCase()}`
      }
      // Always include the content if we have a value, regardless of availableLanguages
      if (value !== undefined && value !== null && value !== '') {
        result[csvKey] = String(value || '').trim()
      }
    }
  }

  return result
}

/**
 * Recursively find all multilingual text objects in a survey
 */
function findMultilingualTexts(obj, availableLanguages, currentPath = '', elementName = '', results = []) {
  if (!obj || typeof obj !== 'object') {
    return results
  }

  // If this is a multilingual object, extract it
  if (isMultilingualObject(obj)) {
    const texts = extractTextFromMultilingualObject(obj, availableLanguages)

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

      findMultilingualTexts(item, availableLanguages, newPath, newElementName, results)
    })
  } else {
    for (const [key, value] of Object.entries(obj)) {
      const newPath = currentPath ? `${currentPath}.${key}` : key

      // Update element name if we encounter a 'name' property
      let newElementName = elementName
      if (key === 'name' && typeof value === 'string') {
        newElementName = value
      }

      findMultilingualTexts(value, availableLanguages, newPath, newElementName, results)
    }
  }

  return results
}

/**
 * Generate CSV content from extracted translations
 */
function generateCSV(translations, surveyName, availableLanguages) {
  const lines = []

  // CSV Header
  const header = ['identifier', 'labels', ...availableLanguages].join(',')
  lines.push(header)

  // Ensure English columns exist
  const languagesWithEnglish = Array.from(new Set([
    ...availableLanguages,
    'en',
    'en-US'
  ]))

  // CSV Rows
  translations.forEach((translation) => {
    const elementName = translation.elementName || 'unknown'
    // Use element name as identifier, survey name in labels
    const identifier = elementName
    const labels = surveyName // Survey name in labels column

    // Escape CSV values (handle quotes and commas)
    const escapeCSV = (value) => {
      if (!value) return ''
      const stringValue = String(value)
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`
      }
      return stringValue
    }

    // Compute per-language values with fallback rules
    const values = languagesWithEnglish.map(lang => {
      // Populate en from default if missing
      if (lang === 'en') {
        return escapeCSV(translation.texts['en'] || translation.texts['default'] || '')
      }
      // Populate en-US from en
      if (lang === 'en-US') {
        const enVal = translation.texts['en'] || translation.texts['default'] || ''
        return escapeCSV(enVal)
      }
      return escapeCSV(translation.texts[lang] || '')
    })

    const row = [
      escapeCSV(identifier),
      escapeCSV(labels),
      ...values
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
    // Normalize missing text.default from value prior to CSV extraction
    const normalizedCount = normalizeDefaultsFromValues(surveyData)
    if (normalizedCount > 0) {
      console.log(`🔧 Normalized ${normalizedCount} items missing text.default before CSV extraction`)
    }

    // Extract survey name from filename
    const surveyName = path.basename(inputFile, '.json').replace(/_survey$/, '_survey')

    console.log(`📝 Extracting translations from ${surveyName}...`)

    // Discover available languages in the survey
    const foundLanguages = discoverLanguagesInSurvey(surveyData)
    const availableLanguages = Array.from(foundLanguages).sort()

    console.log(`🌍 Discovered ${availableLanguages.length} languages in survey: ${availableLanguages.join(', ')}`)

    // Find all multilingual texts
    const translations = findMultilingualTexts(surveyData, availableLanguages)

    console.log(`✅ Found ${translations.length} translatable text items`)

    // Log some examples
    if (translations.length > 0) {
      console.log('📋 Sample translations found:')
      translations.slice(0, 3).forEach((trans, i) => {
        const englishText = trans.texts.en || trans.texts.default || Object.values(trans.texts)[0] || ''
        console.log(`  ${i + 1}. [${trans.elementName}] ${englishText.substring(0, 50)}...`)
      })
    }

    // Generate CSV
    const csvContent = generateCSV(translations, surveyName, availableLanguages)

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
    availableLanguages.forEach(lang => {
      languageCounts[lang] = translations.filter(t => t.texts[lang] && t.texts[lang].length > 0).length
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

export { extractTranslations, findMultilingualTexts, generateCSV, discoverLanguagesInSurvey }
