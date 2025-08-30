import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Fix en-GH translations in Crowdin CSV files by extracting corrected values from JSON files
 */

// Survey file mappings
const SURVEY_MAPPINGS = [
  {
    jsonFile: 'child_survey_updated.json',
    csvFile: 'child_survey_crowdin_translations.csv',
    crowdinPath: 'surveys-current/child_survey_translations.csv'
  },
  {
    jsonFile: 'parent_survey_child_updated.json',
    csvFile: 'parent_survey_child_crowdin_translations.csv',
    crowdinPath: 'surveys-current/parent_survey_child_translations.csv'
  },
  {
    jsonFile: 'parent_survey_family_updated.json',
    csvFile: 'parent_survey_family_crowdin_translations.csv',
    crowdinPath: 'surveys-current/parent_survey_family_translations.csv'
  },
  {
    jsonFile: 'teacher_survey_general_updated.json',
    csvFile: 'teacher_survey_general_crowdin_translations.csv',
    crowdinPath: 'surveys-current/teacher_survey_general_translations.csv'
  },
  {
    jsonFile: 'teacher_survey_classroom_updated.json',
    csvFile: 'teacher_survey_classroom_crowdin_translations.csv',
    crowdinPath: 'surveys-current/teacher_survey_classroom_translations.csv'
  }
]

function extractTranslationsFromJson(jsonData, translations = [], prefix = '') {
  if (!jsonData || typeof jsonData !== 'object') {
    return translations
  }

  // If this object has multilingual content, extract it
  if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
    if ('en-GH' in jsonData && 'en-US' in jsonData) {
      const identifier = prefix || 'unknown'
      const sourceText = jsonData['en-US'] || jsonData['default'] || jsonData['en'] || ''
      const enGhText = jsonData['en-GH'] || ''
      
      if (sourceText && enGhText) {
        translations.push({
          identifier: identifier,
          source: sourceText,
          'en-GH': enGhText
        })
        console.log(`Found translation: ${identifier} -> "${enGhText.substring(0, 50)}${enGhText.length > 50 ? '...' : ''}"`)
      }
    }
  }

  // Recursively process all properties
  for (const [key, value] of Object.entries(jsonData)) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const newPrefix = prefix ? `${prefix}.${key}[${index}]` : `${key}[${index}]`
        extractTranslationsFromJson(item, translations, newPrefix)
      })
    } else if (typeof value === 'object' && value !== null) {
      const newPrefix = prefix ? `${prefix}.${key}` : key
      extractTranslationsFromJson(value, translations, newPrefix)
    }
  }

  return translations
}

function parseCSV(csvContent) {
  const lines = csvContent.split('\n')
  if (lines.length === 0) return { headers: [], rows: [] }
  
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())
  const rows = []
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    
    // Simple CSV parsing - this might need to be more sophisticated for complex content
    const values = line.split(',').map(v => v.replace(/^"|"$/g, '').trim())
    if (values.length >= headers.length) {
      const row = {}
      headers.forEach((header, index) => {
        row[header] = values[index] || ''
      })
      rows.push(row)
    }
  }
  
  return { headers, rows }
}

function generateCSV(headers, rows) {
  const csvLines = []
  
  // Add headers
  csvLines.push(headers.map(h => `"${h}"`).join(','))
  
  // Add rows
  rows.forEach(row => {
    const values = headers.map(header => {
      const value = row[header] || ''
      // Escape quotes and wrap in quotes
      const escapedValue = value.replace(/"/g, '""')
      return `"${escapedValue}"`
    })
    csvLines.push(values.join(','))
  })
  
  return csvLines.join('\n')
}

async function fixCrowdinCSV(mapping) {
  const projectRoot = path.resolve(__dirname, '..')
  const surveysDir = path.join(projectRoot, 'surveys')
  
  const jsonPath = path.join(surveysDir, mapping.jsonFile)
  const csvPath = path.join(surveysDir, mapping.csvFile)
  
  console.log(`\n📝 Processing: ${mapping.jsonFile} -> ${mapping.csvFile}`)
  
  if (!fs.existsSync(jsonPath)) {
    console.warn(`⚠️  JSON file not found: ${jsonPath}`)
    return false
  }
  
  if (!fs.existsSync(csvPath)) {
    console.warn(`⚠️  CSV file not found: ${csvPath}`)
    return false
  }
  
  try {
    // Read and parse JSON file
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    const jsonTranslations = extractTranslationsFromJson(jsonData)
    console.log(`📊 Extracted ${jsonTranslations.length} translations from JSON`)
    
    // Read and parse CSV file
    const csvContent = fs.readFileSync(csvPath, 'utf8')
    const { headers, rows } = parseCSV(csvContent)
    console.log(`📊 Found ${rows.length} rows in CSV`)
    
    // Find en-GH column
    const enGhColumnIndex = headers.findIndex(h => h.toLowerCase().includes('en-gh') || h === 'en-GH')
    if (enGhColumnIndex === -1) {
      console.warn(`⚠️  No en-GH column found in ${mapping.csvFile}`)
      return false
    }
    
    const enGhColumn = headers[enGhColumnIndex]
    console.log(`📍 Found en-GH column: "${enGhColumn}"`)
    
    // Create a lookup map from JSON translations
    const translationMap = new Map()
    jsonTranslations.forEach(t => {
      // Try to match by source text
      if (t.source) {
        translationMap.set(t.source.trim(), t['en-GH'])
      }
    })
    
    // Update CSV rows
    let updatedCount = 0
    rows.forEach(row => {
      const sourceText = (row.source || row.en || row['en-US'] || '').trim()
      if (sourceText && translationMap.has(sourceText)) {
        const newEnGhValue = translationMap.get(sourceText)
        if (row[enGhColumn] !== newEnGhValue) {
          console.log(`🔄 Updating: "${row[enGhColumn]}" -> "${newEnGhValue}"`)
          row[enGhColumn] = newEnGhValue
          updatedCount++
        }
      }
    })
    
    console.log(`✅ Updated ${updatedCount} en-GH translations in CSV`)
    
    if (updatedCount > 0) {
      // Create backup
      const backupPath = `${csvPath}.backup.${Date.now()}`
      fs.writeFileSync(backupPath, csvContent)
      console.log(`📋 Created backup: ${path.basename(backupPath)}`)
      
      // Write updated CSV
      const updatedCSV = generateCSV(headers, rows)
      fs.writeFileSync(csvPath, updatedCSV)
      console.log(`💾 Saved updated CSV: ${mapping.csvFile}`)
      
      return true
    } else {
      console.log(`ℹ️  No updates needed for ${mapping.csvFile}`)
      return false
    }
    
  } catch (error) {
    console.error(`❌ Error processing ${mapping.csvFile}:`, error.message)
    return false
  }
}

async function uploadToCrowdin(mapping) {
  const projectRoot = path.resolve(__dirname, '..')
  const csvPath = path.join(projectRoot, 'surveys', mapping.csvFile)
  
  console.log(`\n📤 Uploading ${mapping.csvFile} to Crowdin...`)
  
  try {
    const result = execSync(
      `crowdin file upload "${csvPath}" --dest "${mapping.crowdinPath}"`,
      { 
        encoding: 'utf8',
        cwd: projectRoot
      }
    )
    console.log('✅ Upload successful')
    console.log(result)
    return true
  } catch (error) {
    console.error('❌ Upload failed:', error.message)
    return false
  }
}

async function main() {
  console.log('🔧 Fixing en-GH translations in Crowdin CSV files...')
  
  const updatedFiles = []
  
  // Process each survey mapping
  for (const mapping of SURVEY_MAPPINGS) {
    const wasUpdated = await fixCrowdinCSV(mapping)
    if (wasUpdated) {
      updatedFiles.push(mapping)
    }
  }
  
  if (updatedFiles.length === 0) {
    console.log('\n✅ No files needed updating!')
    return
  }
  
  console.log(`\n📤 Uploading ${updatedFiles.length} updated files to Crowdin...`)
  
  // Upload updated files to Crowdin
  for (const mapping of updatedFiles) {
    await uploadToCrowdin(mapping)
    // Add a small delay between uploads
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  console.log('\n🎉 All en-GH translations have been fixed in Crowdin!')
  console.log('📁 Backup files created in case you need to revert changes.')
  console.log('🔄 You may need to refresh Crowdin to see the updated translations.')
}

main().catch(console.error)
