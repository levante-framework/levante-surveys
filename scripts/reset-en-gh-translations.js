#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Get current directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    file: null,
    dryRun: false,
    upload: false,
    copyFromColumn: 'en-US'
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--upload') {
      options.upload = true
    } else if (arg === '--copy-from' && i + 1 < args.length) {
      options.copyFromColumn = args[i + 1]
      i++
    } else if (!options.file) {
      options.file = arg
    }
  }

  return options
}

/**
 * Parse CSV line, handling quoted fields properly
 */
function parseCsvLine(line) {
  const fields = []
  let currentField = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentField += '"'
        i += 2
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
        i++
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      fields.push(currentField)
      currentField = ''
      i++
    } else {
      currentField += char
      i++
    }
  }

  // Add the last field
  fields.push(currentField)
  return fields
}

/**
 * Escape CSV field value
 */
function escapeCsvField(value) {
  if (value === null || value === undefined) {
    return ''
  }

  const stringValue = String(value)

  // If the value contains quotes, commas, or newlines, wrap in quotes and escape internal quotes
  if (stringValue.includes('"') || stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('\r')) {
    return '"' + stringValue.replace(/"/g, '""') + '"'
  }

  return stringValue
}

/**
 * Reset en-GH translations by copying from another column
 */
async function resetEnGhTranslations(csvFilePath, options = {}) {
  const { dryRun = false, copyFromColumn = 'en-US', upload = false } = options

  console.log(`🔄 Processing: ${csvFilePath}`)
  console.log(`📋 Copy source: ${copyFromColumn} → en-GH`)
  console.log(`🧪 Dry run: ${dryRun ? 'Yes' : 'No'}`)

  if (!fs.existsSync(csvFilePath)) {
    throw new Error(`File not found: ${csvFilePath}`)
  }

  // Read the CSV file
  const csvContent = fs.readFileSync(csvFilePath, 'utf8')
  const lines = csvContent.split('\n')

  if (lines.length === 0) {
    throw new Error('CSV file is empty')
  }

  // Parse header
  const headerFields = parseCsvLine(lines[0])
  const sourceColumnIndex = headerFields.indexOf(copyFromColumn)
  const targetColumnIndex = headerFields.indexOf('en-GH')

  if (sourceColumnIndex === -1) {
    throw new Error(`Source column '${copyFromColumn}' not found in CSV`)
  }

  if (targetColumnIndex === -1) {
    throw new Error(`Target column 'en-GH' not found in CSV`)
  }

  console.log(`📍 Source column '${copyFromColumn}' at index: ${sourceColumnIndex}`)
  console.log(`📍 Target column 'en-GH' at index: ${targetColumnIndex}`)

  // Process all lines
  const processedLines = []
  let resetCount = 0
  let emptyCount = 0
  let skippedCount = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (!line) {
      processedLines.push('')
      continue
    }

    const fields = parseCsvLine(line)

    // Ensure we have enough fields
    while (fields.length <= Math.max(sourceColumnIndex, targetColumnIndex)) {
      fields.push('')
    }

    const sourceValue = fields[sourceColumnIndex] || ''
    const currentTargetValue = fields[targetColumnIndex] || ''

    // Check if we should reset this field
    let shouldReset = false
    let resetReason = ''

    if (currentTargetValue === '') {
      shouldReset = true
      resetReason = 'empty'
      emptyCount++
    } else if (currentTargetValue.includes('<block><b><font') ||
               currentTargetValue.includes('Bitte geben Sie an') ||
               currentTargetValue.length < 3) {
      shouldReset = true
      resetReason = 'corrupted/incomplete'
      resetCount++
    } else {
      skippedCount++
      resetReason = 'keeping existing'
    }

    if (shouldReset && sourceValue) {
      fields[targetColumnIndex] = sourceValue
      if (i > 0) { // Don't count header
        console.log(`  ✅ Row ${i + 1}: ${resetReason} - copied from ${copyFromColumn}`)
      }
    } else if (shouldReset && !sourceValue) {
      console.log(`  ⚠️  Row ${i + 1}: ${resetReason} - but no source value available`)
    } else if (i > 0) {
      console.log(`  ⏭️  Row ${i + 1}: ${resetReason}`)
    }

    // Rebuild the line
    const newLine = fields.map(escapeCsvField).join(',')
    processedLines.push(newLine)
  }

  const newCsvContent = processedLines.join('\n')

  // Summary
  console.log(`\n📊 Reset Summary:`)
  console.log(`   - Empty fields filled: ${emptyCount}`)
  console.log(`   - Corrupted fields fixed: ${resetCount}`)
  console.log(`   - Existing fields kept: ${skippedCount}`)
  console.log(`   - Total rows processed: ${lines.length - 1}`) // -1 for header

  if (dryRun) {
    console.log(`\n🧪 DRY RUN - No files were modified`)
    return { dryRun: true, resetCount: resetCount + emptyCount, skippedCount }
  }

  // Create backup
  const timestamp = Date.now()
  const backupPath = `${csvFilePath}.backup.${timestamp}`
  fs.writeFileSync(backupPath, csvContent, 'utf8')
  console.log(`💾 Backup created: ${backupPath}`)

  // Write the updated CSV
  fs.writeFileSync(csvFilePath, newCsvContent, 'utf8')
  console.log(`✅ Updated: ${csvFilePath}`)

  // Upload to Crowdin if requested
  if (upload) {
    console.log(`\n📤 Uploading to Crowdin...`)
    try {
      const { execSync } = await import('child_process')

      // Upload the updated CSV to Crowdin
      const relativePath = path.relative(projectRoot, csvFilePath)
      const crowdinPath = `main/surveys-current/${path.basename(csvFilePath)}`

      const uploadCmd = `crowdin file upload "${relativePath}" --dest "${crowdinPath}" --branch main`
      console.log(`   Running: ${uploadCmd}`)

      const result = execSync(uploadCmd, {
        encoding: 'utf8',
        cwd: projectRoot
      })

      console.log(result)
      console.log(`✅ Successfully uploaded to Crowdin: ${crowdinPath}`)

    } catch (error) {
      console.error(`❌ Failed to upload to Crowdin: ${error.message}`)
      throw error
    }
  }

  return {
    resetCount: resetCount + emptyCount,
    skippedCount,
    backupPath,
    outputPath: csvFilePath
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    const options = parseArgs()

    if (!options.file) {
      console.log(`Usage: node reset-en-gh-translations.js <csv-file> [options]`)
      console.log(``)
      console.log(`Options:`)
      console.log(`  --dry-run              Preview changes without modifying files`)
      console.log(`  --upload               Upload to Crowdin after processing`)
      console.log(`  --copy-from <column>   Source column to copy from (default: en-US)`)
      console.log(``)
      console.log(`Examples:`)
      console.log(`  # Preview reset for parent_survey_child`)
      console.log(`  node scripts/reset-en-gh-translations.js temp_investigation/parent_survey_child_translations.csv --dry-run`)
      console.log(``)
      console.log(`  # Reset and upload to Crowdin`)
      console.log(`  node scripts/reset-en-gh-translations.js temp_investigation/parent_survey_child_translations.csv --upload`)
      console.log(``)
      console.log(`  # Copy from a different source column`)
      console.log(`  node scripts/reset-en-gh-translations.js temp_investigation/parent_survey_child_translations.csv --copy-from "source" --dry-run`)
      process.exit(1)
    }

    const filePath = path.resolve(options.file)

    console.log(`🚀 Starting en-GH translation reset...`)
    console.log(`📁 Target file: ${filePath}`)

    const result = await resetEnGhTranslations(filePath, options)

    if (!result.dryRun) {
      console.log(`\n🎉 Reset complete!`)
      console.log(`   - Backup: ${result.backupPath}`)
      console.log(`   - Updated: ${result.outputPath}`)
    }

  } catch (error) {
    console.error(`❌ Error: ${error.message}`)
    process.exit(1)
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}
