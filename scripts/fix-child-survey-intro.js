#!/usr/bin/env node

/**
 * Fix the ChildSurveyIntro Spanish translation issues
 * 1. Replace "Ensaya con las dos primeras preguntas cómo responder." with "Las primeras dos son para practicar."
 * 2. Fix es-AR column that has English instead of Spanish
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const OLD_SPANISH_TEXT = "Ensaya con las dos primeras preguntas cómo responder."
const NEW_SPANISH_TEXT = "Las primeras dos son para practicar."
const ENGLISH_TEXT_IN_ES_AR = "The first two are for practice."

function fixChildSurveyIntro() {
  console.log('🔧 Fixing ChildSurveyIntro Spanish translation issues')
  console.log(`❌ Changing: "${OLD_SPANISH_TEXT}"`)
  console.log(`✅ To: "${NEW_SPANISH_TEXT}"`)
  console.log(`❌ Also fixing es-AR column that has English text`)
  console.log()

  const csvPath = path.join(projectRoot, 'surveys', 'child_survey_crowdin_translations.csv')
  
  if (!fs.existsSync(csvPath)) {
    console.log('❌ CSV file not found:', csvPath)
    return
  }

  console.log('📝 Reading CSV file...')
  let csvContent = fs.readFileSync(csvPath, 'utf8')
  
  const lines = csvContent.split('\n')
  let fixedLines = []
  let foundIntroRow = false
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    if (line.includes('ChildSurveyIntro')) {
      foundIntroRow = true
      console.log('   🔍 Found ChildSurveyIntro row')
      
      // Fix the Spanish text
      let fixedLine = line.replace(new RegExp(OLD_SPANISH_TEXT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), NEW_SPANISH_TEXT)
      
      // Fix the es-AR column that has English instead of Spanish
      fixedLine = fixedLine.replace(ENGLISH_TEXT_IN_ES_AR, NEW_SPANISH_TEXT)
      
      console.log('   ✅ Fixed ChildSurveyIntro translations')
      fixedLines.push(fixedLine)
    } else {
      fixedLines.push(line)
    }
  }
  
  if (!foundIntroRow) {
    console.log('⚠️  ChildSurveyIntro row not found in CSV')
    return
  }
  
  fs.writeFileSync(csvPath, fixedLines.join('\n'))
  console.log('✅ CSV file updated')
  
  console.log()
  console.log('🎉 ChildSurveyIntro translation fix completed!')
  console.log('💡 Next steps:')
  console.log('   1. Re-import: node scripts/import-individual-surveys.js surveys/child_survey_crowdin_translations.csv')
  console.log('   2. Upload: node scripts/upload-corrected-surveys.js child_survey')
}

fixChildSurveyIntro()
