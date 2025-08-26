#!/usr/bin/env node

/**
 * End-to-End Translation Deployment Pipeline
 *
 * This script orchestrates the complete workflow from Crowdin CSV files
 * to deployed and validated survey JSON files in Google Cloud Storage.
 *
 * Pipeline Steps:
 * 1. 🔍 Detect and validate all required CSV files
 * 2. 🌍 Auto-detect and configure any new languages
 * 3. 🔄 Import translations into survey JSON files
 * 4. ✅ Validate updated surveys (structure, required fields, etc.)
 * 5. 📦 Backup existing surveys in cloud storage
 * 6. ☁️  Deploy updated surveys to cloud storage
 * 7. 🧪 Run post-deployment validation
 * 8. 📊 Generate comprehensive deployment report
 *
 * Usage:
 *   node scripts/deploy-translations.js [options]
 *
 * Options:
 *   --dry-run           Preview changes without deploying
 *   --skip-download     Skip downloading latest CSV files from Crowdin
 *   --skip-validation   Skip survey validation steps (not recommended)
 *   --force             Deploy even if validation warnings exist
 *   --env=DEV|PROD      Target environment (default: DEV)
 *
 * Examples:
 *   node scripts/deploy-translations.js --dry-run
 *   node scripts/deploy-translations.js --env=DEV
 *   node scripts/deploy-translations.js --env=PROD --force
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Storage } from '@google-cloud/storage'
import { importAllSurveys } from './import-individual-surveys.js'
import { analyzeCSVFile, generateUpdatedConfig, updateLanguagesFile } from './detect-languages.js'
import { downloadCrowdinSurveys } from './download-crowdin-surveys.js'

// Get current directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// Configuration
const REQUIRED_CSV_FILES = [
  'child_survey_crowdin_translations.csv',
  'parent_survey_family_crowdin_translations.csv',
  'parent_survey_child_crowdin_translations.csv',
  'teacher_survey_general_crowdin_translations.csv',
  'teacher_survey_classroom_crowdin_translations.csv'
]

const SURVEY_JSON_FILES = [
  'child_survey.json',
  'parent_survey_family.json',
  'parent_survey_child.json',
  'teacher_survey_general.json',
  'teacher_survey_classroom.json'
]

/**
 * Pipeline step results tracking
 */
class PipelineResults {
  constructor() {
    this.steps = []
    this.errors = []
    this.warnings = []
    this.startTime = new Date()
    this.success = false
  }

  addStep(name, status, details = {}) {
    this.steps.push({
      name,
      status, // 'success', 'warning', 'error', 'skipped'
      details,
      timestamp: new Date()
    })
  }

  addError(message, step = null) {
    this.errors.push({ message, step, timestamp: new Date() })
  }

  addWarning(message, step = null) {
    this.warnings.push({ message, step, timestamp: new Date() })
  }

  getReport() {
    const endTime = new Date()
    const duration = Math.round((endTime - this.startTime) / 1000)

    return {
      success: this.success,
      duration: `${duration}s`,
      steps: this.steps,
      errors: this.errors,
      warnings: this.warnings,
      summary: {
        total: this.steps.length,
        successful: this.steps.filter(s => s.status === 'success').length,
        warnings: this.steps.filter(s => s.status === 'warning').length,
        errors: this.steps.filter(s => s.status === 'error').length,
        skipped: this.steps.filter(s => s.status === 'skipped').length
      }
    }
  }
}

/**
 * Step 1: Download latest CSV files from Crowdin
 */
async function downloadLatestCSVFiles(results, skipDownload = false) {
  console.log(`📥 Step 1: Downloading latest CSV files from Crowdin${skipDownload ? ' (SKIPPED)' : ''}...`)

  if (skipDownload) {
    console.log('   ⏭️  Skipping download, using existing CSV files')
    results.addStep('download_csv', 'skipped', { reason: 'user_requested' })
    return true
  }

  try {
    const downloadResult = await downloadCrowdinSurveys({ force: true })

    const successful = downloadResult.results.filter(r => r.status === 'success').length
    const failed = downloadResult.results.filter(r => r.status === 'error').length

    console.log(`   📊 Downloaded ${successful}/${REQUIRED_CSV_FILES.length} CSV files`)

    if (failed > 0) {
      results.addWarning(`${failed} CSV files failed to download`, 'download_csv')
    }

    results.addStep('download_csv', downloadResult.success ? 'success' : 'error', {
      successful,
      failed,
      total: REQUIRED_CSV_FILES.length,
      results: downloadResult.results
    })

    return downloadResult.success
  } catch (error) {
    console.error(`   ❌ Download failed: ${error.message}`)
    results.addError(`CSV download failed: ${error.message}`, 'download_csv')
    results.addStep('download_csv', 'error', { error: error.message })
    return false
  }
}

/**
 * Step 2: Validate that all required CSV files exist
 */
function validateCSVFiles(results) {
  console.log('🔍 Step 2: Validating CSV files...')

  const surveysDir = path.join(projectRoot, 'surveys')
  const missingFiles = []
  const foundFiles = []

  for (const csvFile of REQUIRED_CSV_FILES) {
    const filePath = path.join(surveysDir, csvFile)
    if (fs.existsSync(filePath)) {
      foundFiles.push(csvFile)
      console.log(`   ✅ Found: ${csvFile}`)
    } else {
      missingFiles.push(csvFile)
      console.log(`   ❌ Missing: ${csvFile}`)
    }
  }

  if (missingFiles.length > 0) {
    results.addError(`Missing required CSV files: ${missingFiles.join(', ')}`, 'validate_csv')
    results.addStep('validate_csv', 'error', {
      found: foundFiles.length,
      missing: missingFiles.length,
      missingFiles
    })
    return false
  }

  results.addStep('validate_csv', 'success', { found: foundFiles.length })
  return true
}

/**
 * Step 3: Detect and configure new languages
 */
async function detectAndConfigureLanguages(results) {
  console.log('🌍 Step 3: Detecting languages...')

  try {
    const surveysDir = path.join(projectRoot, 'surveys')
    const allDetectedLanguages = []

    // Analyze all CSV files
    for (const csvFile of REQUIRED_CSV_FILES) {
      const filePath = path.join(surveysDir, csvFile)
      const result = analyzeCSVFile(filePath)

      if (result.languages) {
        allDetectedLanguages.push(...result.languages)
      }
    }

    // Remove duplicates
    const uniqueLanguages = allDetectedLanguages.filter((lang, index, arr) =>
      arr.findIndex(l => l.csvCode === lang.csvCode) === index
    )

    const newLanguages = uniqueLanguages.filter(lang => lang.isNew)

    if (newLanguages.length > 0) {
      console.log(`   🆕 Found ${newLanguages.length} new languages: ${newLanguages.map(l => l.csvCode).join(', ')}`)

      const updateResult = generateUpdatedConfig(uniqueLanguages)
      if (updateResult) {
        updateLanguagesFile(updateResult.updatedConfig)
        results.addStep('detect_languages', 'success', {
          newLanguages: newLanguages.length,
          totalLanguages: uniqueLanguages.length,
          added: newLanguages.map(l => ({ code: l.csvCode, name: l.metadata.name }))
        })
      }
    } else {
      console.log('   ✅ No new languages detected')
      results.addStep('detect_languages', 'success', {
        newLanguages: 0,
        totalLanguages: uniqueLanguages.length
      })
    }

    return true
  } catch (error) {
    console.error(`   ❌ Language detection failed: ${error.message}`)
    results.addError(`Language detection failed: ${error.message}`, 'detect_languages')
    results.addStep('detect_languages', 'error', { error: error.message })
    return false
  }
}

/**
 * Step 4: Import translations into survey JSON files
 */
async function importTranslations(results, dryRun = false) {
  console.log(`🔄 Step 4: Importing translations${dryRun ? ' (DRY RUN)' : ''}...`)

  try {
    if (dryRun) {
      console.log('   🔍 DRY RUN: Would import translations but not modifying files')
      results.addStep('import_translations', 'skipped', { reason: 'dry_run' })
      return true
    }

    const importResults = await importAllSurveys(false) // Don't upload yet

    const totalUpdates = importResults.reduce((sum, r) => sum + r.updatedCount, 0)
    const totalTranslations = importResults.reduce((sum, r) => sum + r.translationsCount, 0)
    const successRate = Math.round((totalUpdates / totalTranslations) * 100)

    console.log(`   ✅ Updated ${totalUpdates}/${totalTranslations} translations (${successRate}%)`)

    if (successRate < 90) {
      results.addWarning(`Low translation success rate: ${successRate}%`, 'import_translations')
    }

    results.addStep('import_translations', 'success', {
      surveys: importResults.length,
      totalUpdates,
      totalTranslations,
      successRate,
      results: importResults
    })

    return true
  } catch (error) {
    console.error(`   ❌ Translation import failed: ${error.message}`)
    results.addError(`Translation import failed: ${error.message}`, 'import_translations')
    results.addStep('import_translations', 'error', { error: error.message })
    return false
  }
}

/**
 * Step 5: Validate updated survey JSON files
 */
function validateSurveyFiles(results, skipValidation = false) {
  console.log(`✅ Step 5: Validating survey files${skipValidation ? ' (SKIPPED)' : ''}...`)

  if (skipValidation) {
    results.addStep('validate_surveys', 'skipped', { reason: 'user_requested' })
    return true
  }

  try {
    const surveysDir = path.join(projectRoot, 'surveys')
    const validationResults = []

    for (const jsonFile of SURVEY_JSON_FILES) {
      const updatedFile = jsonFile.replace('.json', '_updated.json')
      const filePath = path.join(surveysDir, updatedFile)

      if (!fs.existsSync(filePath)) {
        results.addWarning(`Updated survey file not found: ${updatedFile}`, 'validate_surveys')
        continue
      }

      try {
        const content = fs.readFileSync(filePath, 'utf8')
        const surveyData = JSON.parse(content)

        // Basic validation checks
        const validation = {
          file: updatedFile,
          valid: true,
          errors: [],
          warnings: []
        }

        // Check required properties
        if (!surveyData.pages || !Array.isArray(surveyData.pages)) {
          validation.errors.push('Missing or invalid pages array')
          validation.valid = false
        }

        // Check for empty pages
        if (surveyData.pages && surveyData.pages.length === 0) {
          validation.warnings.push('Survey has no pages')
        }

        // Check for multilingual objects
        let multilingualCount = 0
        JSON.stringify(surveyData, (key, value) => {
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            const keys = Object.keys(value)
            if (keys.includes('default') || keys.includes('en') || keys.includes('es')) {
              multilingualCount++
            }
          }
          return value
        })

        validation.multilingualObjects = multilingualCount

        if (multilingualCount === 0) {
          validation.warnings.push('No multilingual objects found')
        }

        validationResults.push(validation)

        if (validation.valid) {
          console.log(`   ✅ ${updatedFile}: Valid (${multilingualCount} multilingual objects)`)
        } else {
          console.log(`   ❌ ${updatedFile}: ${validation.errors.join(', ')}`)
        }

        if (validation.warnings.length > 0) {
          console.log(`   ⚠️  ${updatedFile}: ${validation.warnings.join(', ')}`)
        }

      } catch (error) {
        console.log(`   ❌ ${updatedFile}: Invalid JSON - ${error.message}`)
        validationResults.push({
          file: updatedFile,
          valid: false,
          errors: [`Invalid JSON: ${error.message}`],
          warnings: []
        })
      }
    }

    const totalErrors = validationResults.reduce((sum, v) => sum + v.errors.length, 0)
    const totalWarnings = validationResults.reduce((sum, v) => sum + v.warnings.length, 0)
    const validFiles = validationResults.filter(v => v.valid).length

    if (totalErrors > 0) {
      results.addError(`${totalErrors} validation errors found`, 'validate_surveys')
      results.addStep('validate_surveys', 'error', {
        validFiles,
        totalFiles: validationResults.length,
        errors: totalErrors,
        warnings: totalWarnings,
        results: validationResults
      })
      return false
    }

    if (totalWarnings > 0) {
      results.addWarning(`${totalWarnings} validation warnings`, 'validate_surveys')
    }

    results.addStep('validate_surveys', totalWarnings > 0 ? 'warning' : 'success', {
      validFiles,
      totalFiles: validationResults.length,
      errors: totalErrors,
      warnings: totalWarnings,
      results: validationResults
    })

    return true
  } catch (error) {
    console.error(`   ❌ Survey validation failed: ${error.message}`)
    results.addError(`Survey validation failed: ${error.message}`, 'validate_surveys')
    results.addStep('validate_surveys', 'error', { error: error.message })
    return false
  }
}

/**
 * Step 6: Backup existing surveys in cloud storage
 */
async function backupExistingSurveys(results, bucketName, dryRun = false) {
  console.log(`📦 Step 6: Backing up existing surveys${dryRun ? ' (DRY RUN)' : ''}...`)

  if (dryRun) {
    console.log('   🔍 DRY RUN: Would backup existing surveys')
    results.addStep('backup_surveys', 'skipped', { reason: 'dry_run' })
    return true
  }

  try {
    const storage = new Storage()
    const bucket = storage.bucket(bucketName)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFolder = `backups/${timestamp}`

    const backupResults = []

    for (const jsonFile of SURVEY_JSON_FILES) {
      try {
        const [file] = await bucket.file(jsonFile).get()
        const backupDestination = `${backupFolder}/${jsonFile}`

        await file.copy(bucket.file(backupDestination))
        console.log(`   ✅ Backed up: ${jsonFile} → ${backupDestination}`)
        backupResults.push({ file: jsonFile, backup: backupDestination, success: true })
      } catch (error) {
        if (error.code === 404) {
          console.log(`   ⚠️  File not found in bucket: ${jsonFile} (first deployment?)`)
          backupResults.push({ file: jsonFile, success: false, reason: 'not_found' })
        } else {
          console.log(`   ❌ Failed to backup ${jsonFile}: ${error.message}`)
          backupResults.push({ file: jsonFile, success: false, reason: error.message })
        }
      }
    }

    const successfulBackups = backupResults.filter(b => b.success).length

    results.addStep('backup_surveys', 'success', {
      backupFolder,
      successful: successfulBackups,
      total: SURVEY_JSON_FILES.length,
      results: backupResults
    })

    return true
  } catch (error) {
    console.error(`   ❌ Backup failed: ${error.message}`)
    results.addError(`Backup failed: ${error.message}`, 'backup_surveys')
    results.addStep('backup_surveys', 'error', { error: error.message })
    return false
  }
}

/**
 * Step 7: Deploy updated surveys to cloud storage
 */
async function deploySurveys(results, bucketName, dryRun = false) {
  console.log(`☁️  Step 7: Deploying surveys${dryRun ? ' (DRY RUN)' : ''}...`)

  if (dryRun) {
    console.log('   🔍 DRY RUN: Would deploy updated surveys to cloud')
    results.addStep('deploy_surveys', 'skipped', { reason: 'dry_run' })
    return true
  }

  try {
    const storage = new Storage()
    const bucket = storage.bucket(bucketName)
    const surveysDir = path.join(projectRoot, 'surveys')
    const deployResults = []

    for (const jsonFile of SURVEY_JSON_FILES) {
      const updatedFile = jsonFile.replace('.json', '_updated.json')
      const localPath = path.join(surveysDir, updatedFile)

      if (!fs.existsSync(localPath)) {
        console.log(`   ⚠️  Updated file not found: ${updatedFile}`)
        deployResults.push({ file: jsonFile, success: false, reason: 'file_not_found' })
        continue
      }

      try {
        // Upload to main bucket
        await bucket.upload(localPath, {
          destination: jsonFile,
          metadata: {
            contentType: 'application/json',
            cacheControl: 'public, max-age=3600'
          }
        })

        console.log(`   ✅ Deployed: ${updatedFile} → ${jsonFile}`)

        // Also upload to levante-assets-dev bucket in surveys folder
        try {
          const assetsBucket = storage.bucket('levante-assets-dev')
          await assetsBucket.upload(localPath, {
            destination: `surveys/${jsonFile}`,
            metadata: {
              contentType: 'application/json',
              cacheControl: 'public, max-age=3600'
            }
          })
          console.log(`   📂 Copied to assets: surveys/${jsonFile}`)
        } catch (assetsError) {
          console.log(`   ⚠️  Failed to copy to assets bucket: ${assetsError.message}`)
          // Don't fail the whole deployment if assets upload fails
        }

        deployResults.push({ file: jsonFile, success: true })
      } catch (error) {
        console.log(`   ❌ Failed to deploy ${jsonFile}: ${error.message}`)
        deployResults.push({ file: jsonFile, success: false, reason: error.message })
      }
    }

    const successfulDeploys = deployResults.filter(d => d.success).length

    if (successfulDeploys === 0) {
      results.addError('No surveys were deployed successfully', 'deploy_surveys')
      results.addStep('deploy_surveys', 'error', {
        successful: 0,
        total: SURVEY_JSON_FILES.length,
        results: deployResults
      })
      return false
    }

    results.addStep('deploy_surveys', 'success', {
      successful: successfulDeploys,
      total: SURVEY_JSON_FILES.length,
      bucketName,
      assetsBucket: 'levante-assets-dev',
      results: deployResults
    })

    return true
  } catch (error) {
    console.error(`   ❌ Deployment failed: ${error.message}`)
    results.addError(`Deployment failed: ${error.message}`, 'deploy_surveys')
    results.addStep('deploy_surveys', 'error', { error: error.message })
    return false
  }
}

/**
 * Step 8: Post-deployment validation
 */
async function postDeploymentValidation(results, bucketName, dryRun = false) {
  console.log(`🧪 Step 8: Post-deployment validation${dryRun ? ' (SKIPPED)' : ''}...`)

  if (dryRun) {
    console.log('   🔍 DRY RUN: Would validate deployed surveys')
    results.addStep('post_deploy_validation', 'skipped', { reason: 'dry_run' })
    return true
  }

  try {
    const storage = new Storage()
    const bucket = storage.bucket(bucketName)
    const validationResults = []

    for (const jsonFile of SURVEY_JSON_FILES) {
      try {
        const [file] = await bucket.file(jsonFile).download()
        const content = file.toString('utf8')
        const surveyData = JSON.parse(content)

        // Basic checks
        const validation = {
          file: jsonFile,
          valid: true,
          size: file.length,
          hasPages: !!(surveyData.pages && surveyData.pages.length > 0)
        }

        if (!validation.hasPages) {
          validation.valid = false
        }

        validationResults.push(validation)

        if (validation.valid) {
          console.log(`   ✅ ${jsonFile}: Valid (${Math.round(validation.size / 1024)}KB)`)
        } else {
          console.log(`   ❌ ${jsonFile}: Invalid`)
        }

      } catch (error) {
        console.log(`   ❌ ${jsonFile}: Failed to validate - ${error.message}`)
        validationResults.push({
          file: jsonFile,
          valid: false,
          error: error.message
        })
      }
    }

    const validFiles = validationResults.filter(v => v.valid).length

    results.addStep('post_deploy_validation', 'success', {
      validFiles,
      totalFiles: SURVEY_JSON_FILES.length,
      results: validationResults
    })

    return validFiles === SURVEY_JSON_FILES.length
  } catch (error) {
    console.error(`   ❌ Post-deployment validation failed: ${error.message}`)
    results.addError(`Post-deployment validation failed: ${error.message}`, 'post_deploy_validation')
    results.addStep('post_deploy_validation', 'error', { error: error.message })
    return false
  }
}

/**
 * Generate and display final report
 */
function generateReport(results) {
  const report = results.getReport()

  console.log('\n📊 Deployment Report')
  console.log('='.repeat(50))
  console.log(`⏱️  Duration: ${report.duration}`)
  console.log(`✅ Success: ${report.success}`)
  console.log(`📋 Steps: ${report.summary.successful}/${report.summary.total} successful`)

  if (report.summary.warnings > 0) {
    console.log(`⚠️  Warnings: ${report.summary.warnings}`)
  }

  if (report.summary.errors > 0) {
    console.log(`❌ Errors: ${report.summary.errors}`)
  }

  // Detailed step results
  console.log('\n📋 Step Details:')
  report.steps.forEach(step => {
    const icon = {
      'success': '✅',
      'warning': '⚠️ ',
      'error': '❌',
      'skipped': '⏭️ '
    }[step.status] || '❓'

    console.log(`   ${icon} ${step.name}: ${step.status}`)

    if (step.details.error) {
      console.log(`      Error: ${step.details.error}`)
    }

    if (step.details.successful && step.details.total) {
      console.log(`      Progress: ${step.details.successful}/${step.details.total}`)
    }
  })

  // Errors and warnings
  if (report.errors.length > 0) {
    console.log('\n❌ Errors:')
    report.errors.forEach(error => {
      console.log(`   • ${error.message}`)
    })
  }

  if (report.warnings.length > 0) {
    console.log('\n⚠️  Warnings:')
    report.warnings.forEach(warning => {
      console.log(`   • ${warning.message}`)
    })
  }

  console.log('\n' + '='.repeat(50))

  return report
}

/**
 * Main deployment pipeline
 */
async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const skipDownload = args.includes('--skip-download')
  const skipValidation = args.includes('--skip-validation')
  const force = args.includes('--force')
  const envArg = args.find(arg => arg.startsWith('--env='))
  const environment = envArg ? envArg.split('=')[1] : 'DEV'

  // Determine bucket name
  const bucketName = environment === 'PROD' ? 'road-dashboard' : 'levante-assets-dev'

  console.log('🚀 Survey Deployment Pipeline')
  console.log('='.repeat(50))
  console.log(`🎯 Environment: ${environment}`)
  console.log(`📦 Target bucket: gs://${bucketName}`)
  console.log(`🔍 Mode: ${dryRun ? 'DRY RUN' : 'LIVE DEPLOYMENT'}`)
  console.log(`📥 Download: ${skipDownload ? 'DISABLED' : 'ENABLED'}`)
  console.log(`✅ Validation: ${skipValidation ? 'DISABLED' : 'ENABLED'}`)
  console.log('')

  const results = new PipelineResults()
  let success = true

  // Execute pipeline steps
  success = success && await downloadLatestCSVFiles(results, dryRun || skipDownload)
  success = success && validateCSVFiles(results)
  success = success && await detectAndConfigureLanguages(results)
  success = success && await importTranslations(results, dryRun)
  success = success && validateSurveyFiles(results, skipValidation)

  // Only proceed with cloud operations if local steps succeeded
  if (success || force) {
    if (!success && force) {
      console.log('\n⚠️  Forcing deployment despite validation failures...')
      results.addWarning('Deployment forced despite validation failures', 'pipeline')
    }

    success = success && await backupExistingSurveys(results, bucketName, dryRun)
    success = success && await deploySurveys(results, bucketName, dryRun)
    success = success && await postDeploymentValidation(results, bucketName, dryRun)
  } else {
    console.log('\n❌ Skipping cloud deployment due to validation failures')
    console.log('   Use --force to deploy anyway (not recommended)')
  }

  results.success = success

  // Generate final report (logs to console)
  generateReport(results)

  // Exit with appropriate code
  process.exit(success ? 0 : 1)
}

// Run the pipeline
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('\n💥 Pipeline failed with unexpected error:', error)
    process.exit(1)
  })
}

export { main as deployTranslations }
