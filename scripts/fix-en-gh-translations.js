import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Fix en-GH translations by copying from en-US
 * This script recursively finds all en-GH properties and replaces them with en-US values
 */

function fixEnGhTranslations(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj
  }

  // If this object has both en-GH and en-US, copy en-US to en-GH
  if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
    if ('en-GH' in obj && 'en-US' in obj) {
      console.log(`Fixing en-GH: "${obj['en-GH']}" -> "${obj['en-US']}"`)
      obj['en-GH'] = obj['en-US']
    }
  }

  // Recursively process all properties
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (Array.isArray(obj[key])) {
        obj[key] = obj[key].map(item => fixEnGhTranslations(item))
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        obj[key] = fixEnGhTranslations(obj[key])
      }
    }
  }

  return obj
}

async function fixSurveyFile(filePath) {
  console.log(`\n📝 Processing: ${path.basename(filePath)}`)
  
  try {
    // Read the survey file
    const surveyData = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    
    // Create backup
    const backupPath = `${filePath}.backup.${Date.now()}`
    fs.writeFileSync(backupPath, JSON.stringify(surveyData, null, 2))
    console.log(`📋 Created backup: ${path.basename(backupPath)}`)
    
    // Fix en-GH translations
    const fixedData = fixEnGhTranslations(surveyData)
    
    // Write the fixed file
    fs.writeFileSync(filePath, JSON.stringify(fixedData, null, 2))
    console.log(`✅ Fixed en-GH translations in ${path.basename(filePath)}`)
    
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message)
  }
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..')
  const surveysDir = path.join(projectRoot, 'surveys')
  
  // Get all updated survey files
  const surveyFiles = [
    'child_survey_updated.json',
    'parent_survey_child_updated.json',
    'parent_survey_family_updated.json',
    'teacher_survey_general_updated.json',
    'teacher_survey_classroom_updated.json'
  ]
  
  console.log('🔧 Fixing en-GH translations to match en-US...')
  
  for (const fileName of surveyFiles) {
    const filePath = path.join(surveysDir, fileName)
    if (fs.existsSync(filePath)) {
      await fixSurveyFile(filePath)
    } else {
      console.warn(`⚠️  File not found: ${fileName}`)
    }
  }
  
  console.log('\n🎉 All en-GH translations have been fixed!')
  console.log('📁 Backup files created in case you need to revert changes.')
  
  // Also update the public directory files
  console.log('\n📂 Updating public directory files...')
  const publicSurveysDir = path.join(projectRoot, 'public', 'surveys')
  
  for (const fileName of surveyFiles) {
    const sourcePath = path.join(surveysDir, fileName)
    const destPath = path.join(publicSurveysDir, fileName)
    
    if (fs.existsSync(sourcePath) && fs.existsSync(publicSurveysDir)) {
      fs.copyFileSync(sourcePath, destPath)
      console.log(`📋 Copied ${fileName} to public/surveys/`)
    }
  }
  
  console.log('\n✅ All files updated! You can now redeploy the application.')
}

main().catch(console.error)
