#!/usr/bin/env node

/**
 * Fix the SchoolFun Spanish translation inconsistency
 * Changes "¿Te diviertes en el colegio?" to "¿Es divertido ir al colegio?"
 * for es and es-CO to match es-AR
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const CORRECT_TRANSLATION = "¿Es divertido ir al colegio?"
const INCORRECT_TRANSLATION = "¿Te diviertes en el colegio?"

function fixSchoolFunTranslation() {
  console.log('🔧 Fixing SchoolFun Spanish translation inconsistency')
  console.log(`❌ Changing: "${INCORRECT_TRANSLATION}"`)
  console.log(`✅ To: "${CORRECT_TRANSLATION}"`)
  console.log()

  // Fix the CSV file first
  const csvPath = path.join(projectRoot, 'temp_download', 'child_survey_translations.csv')
  if (fs.existsSync(csvPath)) {
    console.log('📝 Fixing CSV file...')
    let csvContent = fs.readFileSync(csvPath, 'utf8')

    // Replace the incorrect translations in the SchoolFun row
    const lines = csvContent.split('\n')
    const fixedLines = lines.map(line => {
      if (line.includes('SchoolFun') && line.includes(INCORRECT_TRANSLATION)) {
        console.log('   🔍 Found SchoolFun row with incorrect translation')
        // Replace the incorrect translations (but keep es-AR as is)
        const fixed = line.replace(
          /"¿Te diviertes en el colegio?"/g,
          `"${CORRECT_TRANSLATION}"`
        )
        console.log('   ✅ Fixed SchoolFun translation')
        return fixed
      }
      return line
    })

    fs.writeFileSync(csvPath, fixedLines.join('\n'))
    console.log('✅ CSV file updated')
  }

  // Also fix the main CSV file we use for import
  const mainCsvPath = path.join(projectRoot, 'surveys', 'child_survey_crowdin_translations.csv')
  if (fs.existsSync(mainCsvPath)) {
    console.log('📝 Fixing main CSV file...')
    let csvContent = fs.readFileSync(mainCsvPath, 'utf8')

    const lines = csvContent.split('\n')
    const fixedLines = lines.map(line => {
      if (line.includes('SchoolFun') && line.includes(INCORRECT_TRANSLATION)) {
        console.log('   🔍 Found SchoolFun row with incorrect translation')
        const fixed = line.replace(
          /"¿Te diviertes en el colegio?"/g,
          `"${CORRECT_TRANSLATION}"`
        )
        console.log('   ✅ Fixed SchoolFun translation')
        return fixed
      }
      return line
    })

    fs.writeFileSync(mainCsvPath, fixedLines.join('\n'))
    console.log('✅ Main CSV file updated')
  }

  console.log()
  console.log('🎉 SchoolFun translation fix completed!')
  console.log('💡 Next steps:')
  console.log('   1. Re-import: node scripts/import-individual-surveys.js surveys/child_survey_crowdin_translations.csv')
  console.log('   2. Upload: node scripts/upload-corrected-surveys.js child_survey')
  console.log('   3. Update Crowdin: crowdin file upload surveys/child_survey_crowdin_translations.csv --dest main/surveys-current/')
}

fixSchoolFunTranslation()
