#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

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
      if (identifier.toLowerCase().includes('child')) {
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
    if (identifier.includes('child_survey') || identifier.toLowerCase().includes('child')) {
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

/**
 * Download bundle from Crowdin using CLI
 */
function downloadCrowdinBundle(bundleId = '20') {
  console.log(`📥 Downloading bundle ${bundleId} from Crowdin...`)
  
  try {
    // Use crowdin CLI to download the specific bundle
    const result = execSync(`crowdin bundle download ${bundleId}`, { 
      encoding: 'utf8',
      cwd: projectRoot 
    })
    
    console.log('✅ Bundle downloaded successfully')
    console.log(result)
    return true
  } catch (error) {
    console.error('❌ Failed to download bundle:', error.message)
    return false
  }
}

/**
 * Find the surveys.csv file in downloaded bundle
 */
function findSurveysCSV() {
  const possiblePaths = [
    path.join(projectRoot, 'surveys.csv'),
    path.join(projectRoot, 'surveys', 'surveys.csv'),
    path.join(projectRoot, 'translations', 'surveys.csv'),
    path.join(projectRoot, 'download', 'surveys.csv')
  ]
  
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      console.log(`📋 Found surveys.csv at: ${filePath}`)
      return filePath
    }
  }
  
  console.error('❌ Could not find surveys.csv file after download')
  return null
}

async function main() {
  const options = {
    backup: process.argv.includes('--backup'),
    force: process.argv.includes('--force'),
    upload: process.argv.includes('--upload')
  }

  console.log('🔄 Crowdin Bundle Download & Split Tool')
  console.log('='.repeat(50))
  console.log(`🔄 Force overwrite: ${options.force}`)
  console.log(`📦 Backup existing: ${options.backup}`)
  console.log(`☁️  Upload after processing: ${options.upload}`)
  console.log('')

  // Step 1: Download bundle from Crowdin
  const downloadSuccess = downloadCrowdinBundle()
  if (!downloadSuccess) {
    process.exit(1)
  }

  // Step 2: Find the surveys.csv file
  const surveysPath = findSurveysCSV()
  if (!surveysPath) {
    process.exit(1)
  }

  // Step 3: Split the combined CSV
  console.log('🔀 Splitting combined surveys.csv into individual files...')
  
  const csvContent = fs.readFileSync(surveysPath, 'utf8')
  console.log(`📋 Read ${csvContent.split('\n').length - 1} rows from combined CSV`)
  
  const surveyFiles = splitCombinedCSV(csvContent)
  
  // Step 4: Write individual files
  const surveysDir = path.join(projectRoot, 'surveys')
  if (!fs.existsSync(surveysDir)) {
    fs.mkdirSync(surveysDir, { recursive: true })
  }
  
  let successCount = 0
  const results = []
  
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
    results.push({ filename, rows: lines.length - 1 })
  }
  
  console.log(`\n🎉 Successfully split into ${successCount} individual survey files`)
  
  // Step 5: Run import script if requested
  if (options.upload) {
    console.log('\n🔄 Running survey import script...')
    try {
      const importResult = execSync('node scripts/import-individual-surveys.js --all --upload', {
        encoding: 'utf8',
        cwd: projectRoot
      })
      console.log(importResult)
    } catch (error) {
      console.error('❌ Import script failed:', error.message)
    }
  } else {
    console.log('\n💡 To update survey JSONs, run: node scripts/import-individual-surveys.js --all')
  }
  
  // Clean up downloaded bundle file if it's not in surveys directory
  if (surveysPath !== path.join(surveysDir, 'surveys.csv')) {
    try {
      fs.unlinkSync(surveysPath)
      console.log('🧹 Cleaned up temporary bundle file')
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
📥 Crowdin Bundle Download & Split Tool

Downloads the latest survey translation bundle from Crowdin and splits it into
individual survey CSV files with complete navigation text translations.

Usage:
  node scripts/download-crowdin-bundle.js [options]

Options:
  --force           Overwrite existing CSV files
  --backup          Backup existing CSV files before overwriting
  --upload          Run import script and upload to GCS after splitting
  --help, -h        Show this help message

Examples:
  node scripts/download-crowdin-bundle.js
  node scripts/download-crowdin-bundle.js --force --backup
  node scripts/download-crowdin-bundle.js --upload

This script:
1. Downloads the complete translation bundle from Crowdin
2. Splits surveys.csv into individual survey files
3. Optionally runs the import script to update JSON files
`)
  process.exit(0)
}

main().catch(console.error)
