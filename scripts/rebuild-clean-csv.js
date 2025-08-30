#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

/**
 * Properly escape CSV field - critical for HTML content with commas
 */
function escapeCSVField(value) {
  if (value === null || value === undefined) return ''

  const str = String(value).trim()
  if (!str) return ''

  // Always quote fields that contain commas, quotes, or newlines
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }

  return str
}

/**
 * Parse a potentially malformed CSV line by finding the pattern
 */
function extractFieldsFromMalformedLine(line) {
  // Try to extract the key fields we need
  const parts = line.split(',')

  // First two fields should be identifier and labels
  const identifier = parts[0] || ''
  const labels = parts[1] || ''

  // For the rest, we need to be more careful due to HTML content
  // Look for patterns to identify where each language starts

  return {
    identifier: identifier.replace(/"/g, ''),
    labels: labels.replace(/"/g, ''),
    // We'll rebuild these properly
    de: '',
    'de-CH': '',
    'en-GH': '',
    'en-US': '',
    es: '',
    'es-AR': '',
    'es-CO': '',
    fr: '',
    'fr-CA': '',
    nl: '',
    source: ''
  }
}

/**
 * Create a clean CSV with proper en-GH content
 */
function rebuildCleanCSV(inputFile, outputFile) {
  console.log(`🔧 Rebuilding clean CSV from: ${inputFile}`)

  const content = fs.readFileSync(inputFile, 'utf8')
  const lines = content.split('\n')

  const cleanLines = []

  // Header
  cleanLines.push('identifier,labels,de,de-CH,en-GH,en-US,es,es-AR,es-CO,fr,fr-CA,nl,source')

  let processedCount = 0

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    try {
      // Extract identifier from the beginning of the line
      const firstComma = line.indexOf(',')
      if (firstComma === -1) continue

      const identifier = line.substring(0, firstComma).replace(/"/g, '')
      if (!identifier) continue

      // For now, create a basic structure with en-GH copied from a clean English source
      // We'll use simple, clean English text for en-GH
      let enGHText = ''

      // Map common identifiers to clean English
      if (identifier.includes('Relationship')) {
        if (line.includes('Biological') || line.includes('biológica')) {
          enGHText = 'Biological or Adoptive Mother'
        } else if (line.includes('Father') || line.includes('Padre')) {
          enGHText = 'Biological or Adoptive Father'
        } else if (line.includes('Step') || line.includes('Stief')) {
          if (line.includes('mother') || line.includes('Mutter')) {
            enGHText = 'Step-mother'
          } else {
            enGHText = 'Step-father'
          }
        } else if (line.includes('Foster') || line.includes('Pflege')) {
          enGHText = 'Foster Parent'
        } else if (line.includes('Relative') || line.includes('Verwandte')) {
          enGHText = 'Other Relative'
        } else if (line.includes('Non-Relative') || line.includes('Nicht-Verwandte')) {
          enGHText = 'Other Non-Relative'
        } else if (line.includes('specify') || line.includes('Specify')) {
          enGHText = 'Please specify your relationship to the child.'
        } else if (identifier === 'RespondentRelationship') {
          enGHText = 'Please indicate your relationship to the child participating in this research project.'
        }
      } else if (identifier.includes('TimeCaring')) {
        if (line.includes('years') || line.includes('Jahre')) {
          enGHText = 'years'
        } else if (line.includes('months') || line.includes('Monate')) {
          enGHText = 'months'
        } else {
          enGHText = 'Please indicate for how long you have been caring for this child.'
        }
      } else if (identifier.includes('Age')) {
        if (line.includes('years of age') || line.includes('Lebensjahre')) {
          enGHText = 'years of age'
        } else {
          enGHText = 'What is your child\'s current age in years?'
        }
      } else if (identifier.includes('Height')) {
        if (line.includes('meters') || line.includes('Meter')) {
          enGHText = 'meters'
        } else if (line.includes('centimeters') || line.includes('Zentimeter')) {
          enGHText = 'centimeters'
        } else {
          enGHText = 'What is your child\'s CURRENT height? (please estimate to the best of your knowledge)'
        }
      } else if (identifier.includes('Weight')) {
        if (line.includes('pounds') || line.includes('kilo')) {
          enGHText = 'pounds'
        } else if (line.includes('Grams') || line.includes('Gramm')) {
          enGHText = 'Grams'
        } else if (identifier.includes('Birth')) {
          enGHText = 'How much did your child weigh at birth? (if you do not know, leave blank)'
        } else {
          enGHText = 'What is your child\'s CURRENT weight? (please estimate to the best of your knowledge)'
        }
      } else if (identifier.includes('Health')) {
        if (line.includes('Excellent') || line.includes('Hervorragend')) {
          enGHText = 'Excellent'
        } else if (line.includes('Very Good') || line.includes('Sehr gut')) {
          enGHText = 'Very Good'
        } else if (line.includes('Good') || line.includes('Gut')) {
          enGHText = 'Good'
        } else if (line.includes('Fair') || line.includes('Mittelmäßig')) {
          enGHText = 'Fair'
        } else if (line.includes('Poor') || line.includes('Schlecht')) {
          enGHText = 'Poor'
        } else {
          enGHText = 'In general, how would you describe your child\'s health?'
        }
      } else if (identifier.includes('Teeth')) {
        if (line.includes('Excellent') || line.includes('Hervorragend')) {
          enGHText = 'Excellent'
        } else if (line.includes('Very Good') || line.includes('Sehr gut')) {
          enGHText = 'Very Good'
        } else if (line.includes('Good') || line.includes('Gut')) {
          enGHText = 'Good'
        } else if (line.includes('Fair') || line.includes('Mittelmäßig')) {
          enGHText = 'Fair'
        } else if (line.includes('Poor') || line.includes('Schlecht')) {
          enGHText = 'Poor'
        } else {
          enGHText = 'How would you describe the condition of your child\'s teeth?'
        }
      } else if (identifier.includes('BornEarly')) {
        if (line.includes('Don\'t know') || line.includes('weiß nicht')) {
          enGHText = 'Don\'t know'
        } else {
          enGHText = 'Was your child born early (more than three weeks before due date)?'
        }
      }

      // Build clean CSV line
      const cleanLine = [
        escapeCSVField(identifier),
        escapeCSVField('parent_survey_child'),
        escapeCSVField(''), // de
        escapeCSVField(''), // de-CH
        escapeCSVField(enGHText), // en-GH - our clean English
        escapeCSVField(''), // en-US
        escapeCSVField(''), // es
        escapeCSVField(''), // es-AR
        escapeCSVField(''), // es-CO
        escapeCSVField(''), // fr
        escapeCSVField(''), // fr-CA
        escapeCSVField(''), // nl
        escapeCSVField(enGHText) // source - same as en-GH
      ].join(',')

      cleanLines.push(cleanLine)
      processedCount++

      if (enGHText) {
        console.log(`✅ ${identifier}: ${enGHText}`)
      }

    } catch (error) {
      console.log(`⚠️  Skipped malformed line ${i + 1}: ${error.message}`)
    }
  }

  const newContent = cleanLines.join('\n')
  fs.writeFileSync(outputFile, newContent, 'utf8')

  console.log(`✅ Created clean CSV: ${outputFile}`)
  console.log(`📊 Processed ${processedCount} entries`)
}

// Main execution
const inputFile = process.argv[2] || 'temp_debug/parent_survey_child_translations.csv'
const outputFile = process.argv[3] || 'temp_debug/parent_survey_child_clean.csv'

rebuildCleanCSV(inputFile, outputFile)
