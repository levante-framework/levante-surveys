#!/usr/bin/env node

/**
 * Script to automatically detect languages from CSV files and update language configuration
 *
 * This script analyzes CSV files from Crowdin or other translation sources to:
 * 1. Detect new language codes that aren't in our current configuration
 * 2. Automatically add them to the centralized language configuration
 * 3. Try to infer language metadata (display names, regions)
 *
 * Usage:
 *   node scripts/detect-languages.js [csv-file]
 *   node scripts/detect-languages.js surveys/surveys.csv
 *   node scripts/detect-languages.js --analyze-all
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_INFO,
  CSV_TO_JSON_MAPPING,
  JSON_TO_CSV_MAPPING,
  getCsvLanguageColumns
} from '../src/constants/languages.js'

// Get current directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// Language code patterns and metadata database
const LANGUAGE_PATTERNS = {
  // Common language mappings with region codes
  'en': { name: 'English', nativeName: 'English', region: 'US' },
  'en-US': { name: 'English', nativeName: 'English', region: 'US' },
  'en-GB': { name: 'English', nativeName: 'English', region: 'GB' },
  'en-CA': { name: 'English', nativeName: 'English', region: 'CA' },
  'es': { name: 'Spanish', nativeName: 'Español', region: 'ES' },
  'es-ES': { name: 'Spanish', nativeName: 'Español', region: 'ES' },
  'es-CO': { name: 'Spanish', nativeName: 'Español', region: 'CO' },
  'es-MX': { name: 'Spanish', nativeName: 'Español', region: 'MX' },
  'de': { name: 'German', nativeName: 'Deutsch', region: 'DE' },
  'de-DE': { name: 'German', nativeName: 'Deutsch', region: 'DE' },
  'de-AT': { name: 'German', nativeName: 'Deutsch', region: 'AT' },
  'fr': { name: 'French', nativeName: 'Français', region: 'FR' },
  'fr-FR': { name: 'French', nativeName: 'Français', region: 'FR' },
  'fr-CA': { name: 'French', nativeName: 'Français', region: 'CA' },
  'nl': { name: 'Dutch', nativeName: 'Nederlands', region: 'NL' },
  'nl-NL': { name: 'Dutch', nativeName: 'Nederlands', region: 'NL' },
  'it': { name: 'Italian', nativeName: 'Italiano', region: 'IT' },
  'it-IT': { name: 'Italian', nativeName: 'Italiano', region: 'IT' },
  'pt': { name: 'Portuguese', nativeName: 'Português', region: 'PT' },
  'pt-PT': { name: 'Portuguese', nativeName: 'Português', region: 'PT' },
  'pt-BR': { name: 'Portuguese', nativeName: 'Português', region: 'BR' },
  'ru': { name: 'Russian', nativeName: 'Русский', region: 'RU' },
  'ru-RU': { name: 'Russian', nativeName: 'Русский', region: 'RU' },
  'zh': { name: 'Chinese', nativeName: '中文', region: 'CN' },
  'zh-CN': { name: 'Chinese Simplified', nativeName: '简体中文', region: 'CN' },
  'zh-TW': { name: 'Chinese Traditional', nativeName: '繁體中文', region: 'TW' },
  'ja': { name: 'Japanese', nativeName: '日本語', region: 'JP' },
  'ja-JP': { name: 'Japanese', nativeName: '日本語', region: 'JP' },
  'ko': { name: 'Korean', nativeName: '한국어', region: 'KR' },
  'ko-KR': { name: 'Korean', nativeName: '한국어', region: 'KR' },
  'ar': { name: 'Arabic', nativeName: 'العربية', region: 'SA', rtl: true },
  'ar-SA': { name: 'Arabic', nativeName: 'العربية', region: 'SA', rtl: true },
  'he': { name: 'Hebrew', nativeName: 'עברית', region: 'IL', rtl: true },
  'he-IL': { name: 'Hebrew', nativeName: 'עברית', region: 'IL', rtl: true },
  'hi': { name: 'Hindi', nativeName: 'हिन्दी', region: 'IN' },
  'hi-IN': { name: 'Hindi', nativeName: 'हिन्दी', region: 'IN' },
  'th': { name: 'Thai', nativeName: 'ไทย', region: 'TH' },
  'th-TH': { name: 'Thai', nativeName: 'ไทย', region: 'TH' },
  'sv': { name: 'Swedish', nativeName: 'Svenska', region: 'SE' },
  'sv-SE': { name: 'Swedish', nativeName: 'Svenska', region: 'SE' },
  'no': { name: 'Norwegian', nativeName: 'Norsk', region: 'NO' },
  'no-NO': { name: 'Norwegian', nativeName: 'Norsk', region: 'NO' },
  'da': { name: 'Danish', nativeName: 'Dansk', region: 'DK' },
  'da-DK': { name: 'Danish', nativeName: 'Dansk', region: 'DK' },
  'fi': { name: 'Finnish', nativeName: 'Suomi', region: 'FI' },
  'fi-FI': { name: 'Finnish', nativeName: 'Suomi', region: 'FI' },
  'pl': { name: 'Polish', nativeName: 'Polski', region: 'PL' },
  'pl-PL': { name: 'Polish', nativeName: 'Polski', region: 'PL' },
  'cs': { name: 'Czech', nativeName: 'Čeština', region: 'CZ' },
  'cs-CZ': { name: 'Czech', nativeName: 'Čeština', region: 'CZ' },
  'hu': { name: 'Hungarian', nativeName: 'Magyar', region: 'HU' },
  'hu-HU': { name: 'Hungarian', nativeName: 'Magyar', region: 'HU' },
  'tr': { name: 'Turkish', nativeName: 'Türkçe', region: 'TR' },
  'tr-TR': { name: 'Turkish', nativeName: 'Türkçe', region: 'TR' },
  'uk': { name: 'Ukrainian', nativeName: 'Українська', region: 'UA' },
  'uk-UA': { name: 'Ukrainian', nativeName: 'Українська', region: 'UA' },
  'bg': { name: 'Bulgarian', nativeName: 'Български', region: 'BG' },
  'bg-BG': { name: 'Bulgarian', nativeName: 'Български', region: 'BG' },
  'ro': { name: 'Romanian', nativeName: 'Română', region: 'RO' },
  'ro-RO': { name: 'Romanian', nativeName: 'Română', region: 'RO' },
  'hr': { name: 'Croatian', nativeName: 'Hrvatski', region: 'HR' },
  'hr-HR': { name: 'Croatian', nativeName: 'Hrvatski', region: 'HR' },
  'sk': { name: 'Slovak', nativeName: 'Slovenčina', region: 'SK' },
  'sk-SK': { name: 'Slovak', nativeName: 'Slovenčina', region: 'SK' },
  'sl': { name: 'Slovenian', nativeName: 'Slovenščina', region: 'SI' },
  'sl-SI': { name: 'Slovenian', nativeName: 'Slovenščina', region: 'SI' },
  'et': { name: 'Estonian', nativeName: 'Eesti', region: 'EE' },
  'et-EE': { name: 'Estonian', nativeName: 'Eesti', region: 'EE' },
  'lv': { name: 'Latvian', nativeName: 'Latviešu', region: 'LV' },
  'lv-LV': { name: 'Latvian', nativeName: 'Latviešu', region: 'LV' },
  'lt': { name: 'Lithuanian', nativeName: 'Lietuvių', region: 'LT' },
  'lt-LT': { name: 'Lithuanian', nativeName: 'Lietuvių', region: 'LT' }
}

/**
 * Parse CSV content and extract language columns
 */
function parseCSVHeader(csvContent) {
  const lines = csvContent.trim().split('\n')
  if (lines.length === 0) return []

  const header = lines[0]
  const columns = []
  let current = ''
  let inQuotes = false

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

  return columns
}

/**
 * Detect language columns from CSV header
 */
function detectLanguageColumns(csvColumns) {
  const nonLanguageColumns = ['identifier', 'labels', 'context', 'item_id', 'element_name', 'file', 'key']
  const languageColumns = csvColumns.filter(col =>
    col &&
    !nonLanguageColumns.includes(col.toLowerCase()) &&
    (col.length === 2 || col.match(/^[a-z]{2}-[A-Z]{2}$/))
  )

  return languageColumns
}

/**
 * Get base language code (remove region suffix)
 */
function getBaseLanguageCode(langCode) {
  return langCode.split('-')[0].toLowerCase()
}

/**
 * Infer language metadata from language code
 */
function inferLanguageMetadata(langCode) {
  // Try exact match first
  if (LANGUAGE_PATTERNS[langCode]) {
    return { ...LANGUAGE_PATTERNS[langCode], rtl: LANGUAGE_PATTERNS[langCode].rtl || false }
  }

  // Try base language code
  const baseCode = getBaseLanguageCode(langCode)
  const baseInfo = LANGUAGE_PATTERNS[baseCode]

  if (baseInfo) {
    // Extract region from full code if available
    const regionMatch = langCode.match(/^[a-z]{2}-([A-Z]{2})$/)
    const region = regionMatch ? regionMatch[1] : baseInfo.region

    return {
      ...baseInfo,
      region,
      rtl: baseInfo.rtl || false
    }
  }

  // Fallback for unknown languages
  return {
    name: langCode.toUpperCase(),
    nativeName: langCode.toUpperCase(),
    region: langCode.split('-')[1] || 'XX',
    rtl: false
  }
}

/**
 * Analyze a single CSV file for language detection
 */
function analyzeCSVFile(filePath) {
  console.log(`🔍 Analyzing: ${path.relative(projectRoot, filePath)}`)

  if (!fs.existsSync(filePath)) {
    console.log(`❌ File not found: ${filePath}`)
    return { languages: [], error: 'File not found' }
  }

  const csvContent = fs.readFileSync(filePath, 'utf8')
  const columns = parseCSVHeader(csvContent)
  const languageColumns = detectLanguageColumns(columns)

  console.log(`📋 Found columns: ${columns.join(', ')}`)
  console.log(`🌍 Detected language columns: ${languageColumns.join(', ')}`)

  const languages = languageColumns.map(langCode => ({
    csvCode: langCode,
    baseCode: getBaseLanguageCode(langCode),
    metadata: inferLanguageMetadata(langCode),
    isNew: !getCsvLanguageColumns().includes(langCode)
  }))

  return { languages, columns }
}

/**
 * Generate updated language configuration
 */
function generateUpdatedConfig(detectedLanguages) {
  const newLanguages = detectedLanguages.filter(lang => lang.isNew)

  if (newLanguages.length === 0) {
    console.log('✅ No new languages detected. Configuration is up to date.')
    return null
  }

  console.log(`🆕 Found ${newLanguages.length} new languages:`)
  newLanguages.forEach(lang => {
    console.log(`   - ${lang.csvCode} (${lang.metadata.name})`)
  })

  // Build updated configuration
  const updatedConfig = {
    supportedLanguages: [...SUPPORTED_LANGUAGES],
    languageInfo: { ...LANGUAGE_INFO },
    csvToJsonMapping: { ...CSV_TO_JSON_MAPPING },
    jsonToCsvMapping: { ...JSON_TO_CSV_MAPPING }
  }

  newLanguages.forEach(lang => {
    const baseCode = lang.baseCode

    // Add to supported languages if not already there
    if (!updatedConfig.supportedLanguages.includes(baseCode)) {
      updatedConfig.supportedLanguages.push(baseCode)
    }

    // Add language info
    updatedConfig.languageInfo[baseCode] = lang.metadata

    // Add mappings
    updatedConfig.csvToJsonMapping[lang.csvCode] = baseCode
    updatedConfig.jsonToCsvMapping[baseCode] = lang.csvCode
  })

  return {
    newLanguages,
    updatedConfig
  }
}

/**
 * Update the languages.js file with new configuration
 */
function updateLanguagesFile(updatedConfig) {
  const languagesFilePath = path.join(projectRoot, 'src/constants/languages.js')

  // Read current file
  const currentContent = fs.readFileSync(languagesFilePath, 'utf8')

  // Generate new configuration strings
  const supportedLanguagesStr = JSON.stringify(updatedConfig.supportedLanguages, null, 2)
    .replace(/\n  /g, '\n ')
    .replace(/\n]/g, ' ]')

  const languageInfoStr = JSON.stringify(updatedConfig.languageInfo, null, 2)
    .replace(/\n    /g, '\n   ')
    .replace(/\n  }/g, '\n  }')

  const csvToJsonStr = JSON.stringify(updatedConfig.csvToJsonMapping, null, 2)
    .replace(/\n  /g, '\n ')
    .replace(/\n}/g, '\n}')

  const jsonToCsvStr = JSON.stringify(updatedConfig.jsonToCsvMapping, null, 2)
    .replace(/\n  /g, '\n ')
    .replace(/\n}/g, '\n}')

  // Replace sections in the file
  let newContent = currentContent

  // Update SUPPORTED_LANGUAGES
  newContent = newContent.replace(
    /export const SUPPORTED_LANGUAGES = \[.*?\]/s,
    `export const SUPPORTED_LANGUAGES = ${supportedLanguagesStr.replace(/"/g, "'")}`
  )

  // Update LANGUAGE_INFO
  newContent = newContent.replace(
    /export const LANGUAGE_INFO = \{.*?\n\}/s,
    `export const LANGUAGE_INFO = ${languageInfoStr}`
  )

  // Update CSV_TO_JSON_MAPPING
  newContent = newContent.replace(
    /export const CSV_TO_JSON_MAPPING = \{.*?\n\}/s,
    `export const CSV_TO_JSON_MAPPING = ${csvToJsonStr}`
  )

  // Update JSON_TO_CSV_MAPPING
  newContent = newContent.replace(
    /export const JSON_TO_CSV_MAPPING = \{.*?\n\}/s,
    `export const JSON_TO_CSV_MAPPING = ${jsonToCsvStr}`
  )

  // Write updated file
  fs.writeFileSync(languagesFilePath, newContent, 'utf8')
  console.log(`✅ Updated: ${path.relative(projectRoot, languagesFilePath)}`)
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2)

  console.log('🌍 Language Detection and Auto-Configuration Tool')
  console.log('='.repeat(50))

  let filesToAnalyze = []

  if (args.includes('--analyze-all')) {
    // Find all survey translation CSV files in surveys directory
    const surveysDir = path.join(projectRoot, 'surveys')
    const files = fs.readdirSync(surveysDir)
    filesToAnalyze = files
      .filter(file => file.endsWith('_translations.csv'))
      .map(file => path.join(surveysDir, file))
    console.log(`🔍 Found ${filesToAnalyze.length} survey translation files`)
  } else if (args.length > 0) {
    // Use specified file(s)
    filesToAnalyze = args.map(arg => path.resolve(projectRoot, arg))
  } else {
    // Default: analyze all survey translation files
    const surveysDir = path.join(projectRoot, 'surveys')
    const files = fs.readdirSync(surveysDir)
    filesToAnalyze = files
      .filter(file => file.endsWith('_translations.csv'))
      .map(file => path.join(surveysDir, file))

    if (filesToAnalyze.length === 0) {
      console.log('❌ No survey translation CSV files found')
      console.log('\nUsage:')
      console.log('  node scripts/detect-languages.js <csv-file>')
      console.log('  node scripts/detect-languages.js --analyze-all')
      console.log('\nExpected files: *_translations.csv in surveys/ directory')
      process.exit(1)
    }
    console.log(`🔍 Found ${filesToAnalyze.length} survey translation files (default mode)`)
  }

  if (filesToAnalyze.length === 0) {
    console.log('❌ No CSV files found to analyze')
    process.exit(1)
  }

  console.log(`📁 Analyzing ${filesToAnalyze.length} CSV file(s)...\n`)

  // Analyze all files
  const allDetectedLanguages = []
  for (const filePath of filesToAnalyze) {
    const result = analyzeCSVFile(filePath)
    if (result.languages) {
      allDetectedLanguages.push(...result.languages)
    }
    console.log()
  }

  // Remove duplicates
  const uniqueLanguages = allDetectedLanguages.filter((lang, index, arr) =>
    arr.findIndex(l => l.csvCode === lang.csvCode) === index
  )

  console.log('📊 Summary:')
  console.log(`   Total unique languages found: ${uniqueLanguages.length}`)
  console.log(`   Currently supported: ${uniqueLanguages.filter(l => !l.isNew).length}`)
  console.log(`   New languages: ${uniqueLanguages.filter(l => l.isNew).length}`)

  // Generate updated configuration
  const updateResult = generateUpdatedConfig(uniqueLanguages)

  if (updateResult) {
    console.log('\n🔧 Would you like to update the language configuration? (y/N)')

    // For now, we'll auto-update. In a real scenario, you might want user confirmation
    console.log('🔄 Updating language configuration...')
    updateLanguagesFile(updateResult.updatedConfig)

    console.log('\n🎉 Language configuration updated successfully!')
    console.log('\nNext steps:')
    console.log('1. Review the updated src/constants/languages.js file')
    console.log('2. Test your scripts with the new language support')
    console.log('3. Update your documentation if needed')
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { analyzeCSVFile, detectLanguageColumns, inferLanguageMetadata, generateUpdatedConfig, updateLanguagesFile }
