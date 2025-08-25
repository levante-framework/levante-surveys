// Quick test to see what happens with unsupported locales
import fs from 'fs'

const surveyData = JSON.parse(fs.readFileSync('./public/surveys/child_survey.json', 'utf8'))

console.log('🔍 Testing locale fallback behavior...')

// Check what locales actually exist in the survey
const surveyString = JSON.stringify(surveyData)
const testLocales = ['en', 'es', 'de', 'fr', 'de-AT', 'en-GB', 'es-CO']

console.log('\n📊 Locale Content Analysis:')
testLocales.forEach(locale => {
  const hasContent = surveyString.includes(`"${locale}":`)
  const hasUnderscoreVersion = surveyString.includes(`"${locale.replace('-', '_')}":`)

  console.log(`${locale.padEnd(8)}: ${hasContent ? '✅ Has content' : '❌ No content'} ${hasUnderscoreVersion ? '(underscore version exists)' : ''}`)
})

console.log('\n🔍 Sample of what exists in the survey:')
// Find all language keys in the survey
const languageKeys = new Set()
const regex = /"([a-z]{2}[-_][A-Z]{2}|[a-z]{2}|default)":/g
let match
while ((match = regex.exec(surveyString)) !== null) {
  languageKeys.add(match[1])
}

console.log('Found language keys:', Array.from(languageKeys).sort())
