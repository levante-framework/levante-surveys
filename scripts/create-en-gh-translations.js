#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

/**
 * Parse CSV line properly handling quoted fields
 */
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 2
      } else {
        inQuotes = !inQuotes
        i++
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
      i++
    } else {
      current += char
      i++
    }
  }

  result.push(current)
  return result
}

/**
 * Escape CSV field
 */
function escapeCSVField(value) {
  if (!value) return ''
  const str = String(value)
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

/**
 * Create en-GH translation file from the main CSV
 */
function createEnGhTranslations(inputFile, outputFile) {
  console.log(`🔧 Creating en-GH translations from: ${inputFile}`)

  const content = fs.readFileSync(inputFile, 'utf8')
  const lines = content.split('\n')

  const enGhLines = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const fields = parseCSVLine(line)

    if (i === 0) {
      // Header: identifier, source, translation
      enGhLines.push('identifier,source,translation')
      continue
    }

    const identifier = fields[0] || ''
    const enUS = fields[5] || '' // en-US column
    const enGH = fields[4] || '' // en-GH column

    // Use en-US as source and target for en-GH
    if (identifier && enUS && enUS.trim()) {
      const csvLine = [
        escapeCSVField(identifier),
        escapeCSVField(enUS),
        escapeCSVField(enUS) // Copy en-US to en-GH
      ].join(',')

      enGhLines.push(csvLine)

      if (i <= 20) { // Show first 20 for debugging
        console.log(`✅ Row ${i}: ${identifier} -> ${enUS.substring(0, 50)}${enUS.length > 50 ? '...' : ''}`)
      }
    }
  }

  const newContent = enGhLines.join('\n')
  fs.writeFileSync(outputFile, newContent, 'utf8')

  console.log(`✅ Created en-GH translation file: ${outputFile}`)
  console.log(`📊 Total translations: ${enGhLines.length - 1}`)
}

// Main execution
const inputFile = process.argv[2] || 'temp_debug/parent_survey_child_translations.csv'
const outputFile = process.argv[3] || 'temp_debug/parent_survey_child_en_gh.csv'

createEnGhTranslations(inputFile, outputFile)
