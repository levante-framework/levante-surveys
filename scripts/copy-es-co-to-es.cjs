#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { Storage } = require('@google-cloud/storage')

const projectRoot = path.resolve(__dirname, '..')
const BUCKET_NAME = 'levante-assets-dev'

/**
 * Recursively copy es-CO translations to es in a survey object
 */
function copyEsCoToEs(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(copyEsCoToEs)
  }

  // Check if this is a multilingual object (has language keys)
  const hasLanguageKeys = obj.hasOwnProperty('default') || 
                         obj.hasOwnProperty('en') || 
                         obj.hasOwnProperty('es') || 
                         obj.hasOwnProperty('es-CO')

  if (hasLanguageKeys && obj['es-CO']) {
    // Copy es-CO to es
    obj.es = obj['es-CO']
    console.log(`   ✅ Copied es-CO to es: "${obj['es-CO'].substring(0, 50)}${obj['es-CO'].length > 50 ? '...' : ''}"`)
  }

  // Recursively process all properties
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    result[key] = copyEsCoToEs(value)
  }

  return result
}

/**
 * Backup existing file in Google Cloud Storage
 */
async function backupExistingFile(bucketName, fileName, backupFolder) {
  try {
    const storage = new Storage()
    const bucket = storage.bucket(bucketName)
    const sourceFile = `surveys/${fileName}`
    const backupDestination = `${backupFolder}/${fileName}`

    // Check if file exists before trying to backup
    const [exists] = await bucket.file(sourceFile).exists()
    if (!exists) {
      console.log(`   ⚠️  File not found in bucket: ${fileName} (first deployment?)`)
      return { success: false, reason: 'not_found' }
    }

    // Copy file to backup location
    await bucket.file(sourceFile).copy(bucket.file(backupDestination))
    console.log(`   ✅ Backed up: ${fileName} → ${backupDestination}`)
    return { success: true, backup: backupDestination }

  } catch (error) {
    console.log(`   ❌ Failed to backup ${fileName}: ${error.message}`)
    return { success: false, reason: error.message }
  }
}

/**
 * Upload file to Google Cloud Storage
 */
async function uploadToGCS(filePath, fileName, backupFolder = null) {
  try {
    const storage = new Storage()
    const bucket = storage.bucket(BUCKET_NAME)

    // Backup existing file if backup folder is provided
    if (backupFolder) {
      console.log(`📦 Backing up existing ${fileName}...`)
      await backupExistingFile(BUCKET_NAME, fileName, backupFolder)
    }

    console.log(`☁️  Uploading ${fileName} to gs://${BUCKET_NAME}/surveys/...`)

    const [file] = await bucket.upload(filePath, {
      destination: `surveys/${fileName}`,
      metadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=3600'
      }
    })

    console.log(`✅ Successfully uploaded ${fileName} to Google Cloud Storage`)
    return true
  } catch (error) {
    console.error(`❌ Failed to upload ${fileName}:`, error.message)
    return false
  }
}

/**
 * Process child survey to copy es-CO to es
 */
async function processChildSurvey(shouldUpload = false) {
  const surveyPath = path.join(projectRoot, 'surveys', 'child_survey_updated.json')
  
  if (!fs.existsSync(surveyPath)) {
    console.error(`❌ Survey file not found: ${surveyPath}`)
    return false
  }

  console.log('🔄 Processing Child Survey: Copying es-CO to es')
  console.log('=' .repeat(50))
  
  // Read the survey
  const surveyData = JSON.parse(fs.readFileSync(surveyPath, 'utf8'))
  
  console.log('📋 Original survey loaded')
  
  // Copy es-CO to es
  const updatedSurvey = copyEsCoToEs(surveyData)
  
  // Save the updated survey
  const outputPath = path.join(projectRoot, 'surveys', 'child_survey_es_updated.json')
  fs.writeFileSync(outputPath, JSON.stringify(updatedSurvey, null, 2), 'utf8')
  
  console.log(`💾 Updated survey saved to: surveys/child_survey_es_updated.json`)
  
  // Upload if requested
  if (shouldUpload) {
    // Create backup folder with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19)
    const backupFolder = `surveys/backup_${timestamp}`
    console.log(`📦 Backup folder: ${backupFolder}`)
    
    const uploadSuccess = await uploadToGCS(outputPath, 'child_survey.json', backupFolder)
    
    if (uploadSuccess) {
      console.log('🎉 Child survey successfully updated with es-CO → es translations!')
    } else {
      console.log('❌ Upload failed')
      return false
    }
  }
  
  return true
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2)
  const shouldUpload = args.includes('--upload')
  
  console.log('🔄 Copy es-CO to es Translation Tool')
  console.log('=' .repeat(50))
  console.log(`📦 Target bucket: gs://${BUCKET_NAME}`)
  console.log(`☁️  Upload mode: ${shouldUpload ? 'ENABLED' : 'LOCAL ONLY'}\n`)
  
  const success = await processChildSurvey(shouldUpload)
  
  if (success) {
    console.log('\n✅ Process completed successfully!')
    if (!shouldUpload) {
      console.log('💡 Run with --upload flag to deploy to Google Cloud Storage')
    }
  } else {
    console.log('\n❌ Process failed')
    process.exit(1)
  }
}

main().catch(console.error)
