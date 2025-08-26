#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.dirname(__dirname)

const TARGET_CSV_FILES = [
  'child_survey_crowdin_translations.csv',
  'parent_survey_family_crowdin_translations.csv',
  'parent_survey_child_crowdin_translations.csv',
  'teacher_survey_general_crowdin_translations.csv',
  'teacher_survey_classroom_crowdin_translations.csv'
]

// Survey name to filename mapping
const SURVEY_NAME_MAPPING = {
  'child_survey': 'child_survey_crowdin_translations.csv',
  'parent_survey_family': 'parent_survey_family_crowdin_translations.csv',
  'parent_survey_child': 'parent_survey_child_crowdin_translations.csv',
  'teacher_survey_general': 'teacher_survey_general_crowdin_translations.csv',
  'teacher_survey_classroom': 'teacher_survey_classroom_crowdin_translations.csv'
}

// Helper function to parse CSV line respecting quotes
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}

/**
 * Parse the combined CSV and split by survey prefixes
 */
function splitCombinedCSV(csvContent) {
  const lines = csvContent.trim().split('\n')
  if (lines.length < 2) return {}

  const header = lines[0]
  const surveyFiles = {}

  // Initialize each survey file with header
  for (const filename of TARGET_CSV_FILES) {
    surveyFiles[filename] = [header]
  }

  // Find the labels column index
  const headerColumns = parseCSVLine(header)
  const labelsIndex = headerColumns.indexOf('labels')

  if (labelsIndex === -1) {
    console.log('   ⚠️  No labels column found, using identifier patterns')
    return splitByIdentifierPatterns(lines, header, surveyFiles)
  }

  console.log(`   📋 Using labels column (index ${labelsIndex}) for survey grouping`)

  // Process each data row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const columns = parseCSVLine(line)
    if (columns.length <= labelsIndex) continue

    const surveyName = columns[labelsIndex]
    const filename = SURVEY_NAME_MAPPING[surveyName]

    if (filename && surveyFiles[filename]) {
      surveyFiles[filename].push(line)
    } else {
      // Try fallback patterns if survey name doesn't match
      const identifier = columns[0] || ''
      let matched = false

      // Simple fallback based on common patterns
      if (identifier.toLowerCase().includes('child') && !identifier.toLowerCase().includes('parent')) {
        surveyFiles['child_survey_crowdin_translations.csv'].push(line)
        matched = true
      } else if (identifier.toLowerCase().includes('family')) {
        surveyFiles['parent_survey_family_crowdin_translations.csv'].push(line)
        matched = true
      } else if (identifier.toLowerCase().includes('parent')) {
        surveyFiles['parent_survey_child_crowdin_translations.csv'].push(line)
        matched = true
      } else if (identifier.toLowerCase().includes('teacher') && identifier.toLowerCase().includes('general')) {
        surveyFiles['teacher_survey_general_crowdin_translations.csv'].push(line)
        matched = true
      } else if (identifier.toLowerCase().includes('teacher')) {
        surveyFiles['teacher_survey_classroom_crowdin_translations.csv'].push(line)
        matched = true
      }

      if (!matched) {
        console.log(`   ⚠️  Unmatched row - Survey: "${surveyName}", Identifier: "${identifier}"`)
      }
    }
  }

  return surveyFiles
}

function splitByIdentifierPatterns(lines, header, surveyFiles) {
  console.log('   🔍 Using identifier patterns for survey grouping')

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const columns = parseCSVLine(line)
    const identifier = columns[0] || ''
    let matched = false

    // Pattern matching based on identifiers
    if (identifier.includes('child_survey') || (identifier.toLowerCase().includes('child') && !identifier.toLowerCase().includes('parent'))) {
      surveyFiles['child_survey_crowdin_translations.csv'].push(line)
      matched = true
    } else if (identifier.includes('parent_survey_family') || identifier.toLowerCase().includes('family')) {
      surveyFiles['parent_survey_family_crowdin_translations.csv'].push(line)
      matched = true
    } else if (identifier.includes('parent_survey_child') || (identifier.toLowerCase().includes('parent') && !identifier.toLowerCase().includes('family'))) {
      surveyFiles['parent_survey_child_crowdin_translations.csv'].push(line)
      matched = true
    } else if (identifier.includes('teacher_survey_general') || (identifier.toLowerCase().includes('teacher') && identifier.toLowerCase().includes('general'))) {
      surveyFiles['teacher_survey_general_crowdin_translations.csv'].push(line)
      matched = true
    } else if (identifier.includes('teacher_survey_classroom') || (identifier.toLowerCase().includes('teacher') && !identifier.toLowerCase().includes('general'))) {
      surveyFiles['teacher_survey_classroom_crowdin_translations.csv'].push(line)
      matched = true
    }

    if (!matched) {
      console.log(`   ⚠️  Unmatched identifier: "${identifier}"`)
    }
  }

  return surveyFiles
}

async function main() {
  const options = {
    force: process.argv.includes('--force'),
    backup: process.argv.includes('--backup')
  }

  // Look for surveys.csv in multiple locations
  const possiblePaths = [
    path.join(projectRoot, 'surveys', 'surveys.csv'),
    path.join(projectRoot, 'translations', 'surveys.csv'),
    path.join(projectRoot, 'surveys.csv')
  ]

  let surveysPath = null
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      surveysPath = filePath
      break
    }
  }

  if (!surveysPath) {
    console.log('❌ surveys.csv not found in any expected location')
    console.log('Expected locations:')
    possiblePaths.forEach(p => console.log(`  - ${p}`))
    process.exit(1)
  }

  console.log('🔀 Splitting Crowdin bundle surveys.csv into individual files...')
  console.log(`📁 Source: ${surveysPath}`)
  console.log(`🔄 Force overwrite: ${options.force}`)
  console.log(`📦 Backup existing: ${options.backup}`)
  console.log('')

  // Read the combined CSV
  const csvContent = fs.readFileSync(surveysPath, 'utf8')
  console.log(`📋 Read ${csvContent.split('\n').length - 1} rows from bundle CSV`)

  // Split into individual files
  const surveyFiles = splitCombinedCSV(csvContent)

  // Write individual files
  const surveysDir = path.join(projectRoot, 'surveys')
  if (!fs.existsSync(surveysDir)) {
    fs.mkdirSync(surveysDir, { recursive: true })
  }

  let successCount = 0

  for (const [filename, lines] of Object.entries(surveyFiles)) {
    if (lines.length <= 1) {
      console.log(`⚠️  ${filename}: No data rows, skipping`)
      continue
    }

    const filePath = path.join(surveysDir, filename)

    // Handle existing files
    if (fs.existsSync(filePath) && !options.force) {
      console.log(`⚠️  ${filename}: File exists, skipping (use --force to overwrite)`)
      continue
    }

    // Backup if requested
    if (fs.existsSync(filePath) && options.backup) {
      const backupPath = `${filePath}.backup.${Date.now()}`
      fs.copyFileSync(filePath, backupPath)
      console.log(`📦 Backed up ${filename} to ${path.basename(backupPath)}`)
    }

    const csvContent = lines.join('\n')
    fs.writeFileSync(filePath, csvContent, 'utf8')

    console.log(`✅ ${filename}: ${lines.length - 1} rows written`)
    successCount++
  }

  console.log(`\n🎉 Successfully split into ${successCount} individual survey files`)
  console.log('\n💡 Next: Run "npm run import-surveys-individual:all" to update survey JSONs')
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🔀 Crowdin Bundle Splitter

Splits a combined surveys.csv file from Crowdin bundle downloads into individual
survey CSV files with complete navigation text translations.

Usage:
  node scripts/split-crowdin-bundle.js [options]

Options:
  --force           Overwrite existing CSV files
  --backup          Backup existing CSV files before overwriting
  --help, -h        Show this help message

Examples:
  node scripts/split-crowdin-bundle.js
  node scripts/split-crowdin-bundle.js --force --backup

This script looks for surveys.csv in:
  - surveys/surveys.csv
  - translations/surveys.csv
  - surveys.csv (project root)
`)
  process.exit(0)
}

main().catch(console.error)
