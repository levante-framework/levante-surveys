#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.dirname(__dirname)

/**
 * Convert underscore format language codes to hyphen format throughout a JSON object
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
 * Convert language codes in a single survey file
 */
function convertSurveyFile(filePath) {
  console.log(`🔄 Converting language codes in: ${path.basename(filePath)}`)

  if (!fs.existsSync(filePath)) {
    console.log(`❌ File not found: ${filePath}`)
    return false
  }

  try {
    // Read the survey JSON
    const surveyData = JSON.parse(fs.readFileSync(filePath, 'utf8'))

    // Check if any underscore format codes exist
    const jsonString = JSON.stringify(surveyData)
    const hasUnderscoreFormat = /["'](?:es_co|es_ar|de_ch|fr_ca|en_us|en_gb|en_gh)["']/.test(jsonString)

    if (!hasUnderscoreFormat) {
      console.log(`✅ No underscore format codes found in ${path.basename(filePath)}`)
      return true
    }

    // Convert the survey data
    const convertedData = convertUnderscoreToHyphenFormat(surveyData)

    // Create backup
    const backupPath = `${filePath}.backup.${Date.now()}`
    fs.copyFileSync(filePath, backupPath)
    console.log(`📦 Backup created: ${path.basename(backupPath)}`)

    // Write the converted file
    fs.writeFileSync(filePath, JSON.stringify(convertedData, null, 2), 'utf8')

    // Count conversions
    const originalCount = (jsonString.match(/["'](?:es_co|es_ar|de_ch|fr_ca|en_us|en_gb|en_gh)["']/g) || []).length
    console.log(`✅ Converted ${originalCount} language code references in ${path.basename(filePath)}`)

    return true
  } catch (error) {
    console.error(`❌ Error converting ${path.basename(filePath)}: ${error.message}`)
    return false
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2)
  const showHelp = args.includes('--help') || args.includes('-h')
  const processAll = args.includes('--all')
  const surveysDir = path.join(projectRoot, 'surveys')

  if (showHelp) {
    console.log(`
🔄 Language Code Converter

Converts underscore format language codes (es_co, fr_ca, etc.) to hyphen format
(es-CO, fr-CA, etc.) in survey JSON files. This ensures consistency with Crowdin
exports and maintains proper language support.

Usage:
  node scripts/convert-language-codes.js [file] [options]
  node scripts/convert-language-codes.js --all [options]

Options:
  --all             Convert all survey JSON files in surveys/ directory
  --help, -h        Show this help message

Examples:
  node scripts/convert-language-codes.js surveys/child_survey.json
  node scripts/convert-language-codes.js --all

This script:
1. Detects underscore format language codes (es_co, fr_ca, etc.)
2. Converts them to hyphen format (es-CO, fr-CA, etc.)
3. Creates automatic backups before conversion
4. Preserves all existing translations and data
`)
    process.exit(0)
  }

  console.log('🔄 Language Code Converter')
  console.log('='.repeat(50))

  let filesToProcess = []

  if (processAll) {
    console.log('📁 Processing all survey JSON files...')

    // Find all survey JSON files
    const surveyFiles = [
      'child_survey.json',
      'parent_survey_family.json',
      'parent_survey_child.json',
      'teacher_survey_general.json',
      'teacher_survey_classroom.json'
    ]

    filesToProcess = surveyFiles.map(file => path.join(surveysDir, file))
  } else if (args.length > 0) {
    // Process specific file
    const inputFile = args[0]
    const filePath = path.isAbsolute(inputFile) ? inputFile : path.join(projectRoot, inputFile)
    filesToProcess = [filePath]
  } else {
    console.log('❌ No files specified. Use --all or provide a file path.')
    console.log('Run with --help for usage information.')
    process.exit(1)
  }

  let successCount = 0
  let totalCount = filesToProcess.length

  for (const filePath of filesToProcess) {
    if (convertSurveyFile(filePath)) {
      successCount++
    }
  }

  console.log('')
  console.log(`🎉 Conversion complete: ${successCount}/${totalCount} files processed successfully`)

  if (successCount > 0) {
    console.log('')
    console.log('💡 Next steps:')
    console.log('  - Review converted files to ensure correctness')
    console.log('  - Run import script to update with latest Crowdin translations:')
    console.log('    npm run import-surveys-individual:all')
    console.log('  - Deploy if needed:')
    console.log('    npm run import-surveys-individual:upload')
  }
}

main().catch(console.error)
