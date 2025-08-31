import type { SurveyFileKey } from '@/constants/bucket'

// Local survey data mapping - we'll load these dynamically
const LOCAL_SURVEY_FILES: Record<SurveyFileKey, string> = {
  CHILD: '/surveys/child_survey_updated.json',
  PARENT_FAMILY: '/surveys/parent_survey_family_updated.json',
  PARENT_CHILD: '/surveys/parent_survey_child_updated.json',
  TEACHER_GENERAL: '/surveys/teacher_survey_general_updated.json',
  TEACHER_CLASSROOM: '/surveys/teacher_survey_classroom_updated.json'
}

// Cache for loaded surveys
const surveyCache: Record<SurveyFileKey, any> = {}

// Local survey response interface (similar to the GCS one)
export interface LocalSurveyResponse {
  data: any
  metadata: {
    size: number
    source: 'local'
    fileName: string
  }
}

/**
 * Load a specific survey from local files
 */
export async function loadLocalSurvey(surveyKey: SurveyFileKey): Promise<LocalSurveyResponse> {
  // Check cache first
  if (surveyCache[surveyKey]) {
    return {
      data: surveyCache[surveyKey],
      metadata: {
        size: JSON.stringify(surveyCache[surveyKey]).length,
        source: 'local',
        fileName: getLocalFileName(surveyKey)
      }
    }
  }

  const filePath = LOCAL_SURVEY_FILES[surveyKey]
  if (!filePath) {
    throw new Error(`Local survey file path not found: ${surveyKey}`)
  }

  try {
    // Fetch the JSON file from the public directory
    const response = await fetch(filePath)
    if (!response.ok) {
      throw new Error(`Failed to fetch survey: ${response.status} ${response.statusText}`)
    }

    const surveyData = await response.json()

    // Cache the loaded survey
    surveyCache[surveyKey] = surveyData

    return {
      data: surveyData,
      metadata: {
        size: JSON.stringify(surveyData).length,
        source: 'local',
        fileName: getLocalFileName(surveyKey)
      }
    }
  } catch (error: any) {
    throw new Error(`Failed to load local survey ${surveyKey}: ${error?.message || error}`)
  }
}

/**
 * Load all available local surveys
 */
export async function loadAllLocalSurveys(): Promise<Record<SurveyFileKey, any>> {
  try {
    console.log('🔍 Loading all local surveys...')

    const surveys: Record<SurveyFileKey, any> = {}
    const surveyKeys = Object.keys(LOCAL_SURVEY_FILES) as SurveyFileKey[]

    // Load surveys in parallel
    const promises = surveyKeys.map(async (key) => {
      try {
        const response = await loadLocalSurvey(key)
        surveys[key] = response.data
        console.log(`✅ Loaded local survey: ${key}`)
      } catch (error: any) {
        console.warn(`❌ Failed to load local survey ${key}: ${error?.message || error}`)
      }
    })

    await Promise.allSettled(promises)

    const loadedCount = Object.keys(surveys).length
    console.log(`✅ Successfully loaded ${loadedCount}/${surveyKeys.length} local surveys`)

    return surveys
  } catch (error: any) {
    console.error('Error loading local surveys:', error)
    throw error
  }
}

/**
 * Check if a local survey exists
 */
export function checkLocalSurveyExists(surveyKey: SurveyFileKey): boolean {
  return surveyKey in LOCAL_SURVEYS && LOCAL_SURVEYS[surveyKey] != null
}

/**
 * Get local survey metadata without loading the full content
 */
export function getLocalSurveyMetadata(surveyKey: SurveyFileKey) {
  if (!checkLocalSurveyExists(surveyKey)) {
    return {
      exists: false,
      error: `Local survey not found: ${surveyKey}`
    }
  }

  const surveyData = LOCAL_SURVEYS[surveyKey]
  return {
    exists: true,
    size: JSON.stringify(surveyData).length,
    source: 'local',
    fileName: getLocalFileName(surveyKey),
    pages: surveyData.pages?.length || 0,
    hasMultilingualContent: hasMultilingualContent(surveyData)
  }
}

/**
 * Get the local file name for a survey key
 */
function getLocalFileName(surveyKey: SurveyFileKey): string {
  const fileNames: Record<SurveyFileKey, string> = {
    CHILD: 'child_survey_updated.json',
    PARENT_FAMILY: 'parent_survey_family_updated.json',
    PARENT_CHILD: 'parent_survey_child_updated.json',
    TEACHER_GENERAL: 'teacher_survey_general_updated.json',
    TEACHER_CLASSROOM: 'teacher_survey_classroom_updated.json'
  }

  return fileNames[surveyKey] || `${surveyKey.toLowerCase()}_updated.json`
}

/**
 * Check if survey data contains multilingual content
 */
function hasMultilingualContent(surveyData: any): boolean {
  const checkForLanguages = (obj: any): boolean => {
    if (!obj || typeof obj !== 'object') return false

    // Check if this object has language keys
    const languageKeys = ['en', 'es', 'de', 'fr', 'nl', 'es-CO', 'fr-CA', 'de-CH', 'es-AR', 'en-US', 'en-GH', 'default']
    const hasLanguageKeys = languageKeys.some(key => key in obj)

    if (hasLanguageKeys) return true

    // Recursively check nested objects and arrays
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        if (value.some(item => checkForLanguages(item))) return true
      } else if (typeof value === 'object' && value !== null) {
        if (checkForLanguages(value)) return true
      }
    }

    return false
  }

  return checkForLanguages(surveyData)
}

/**
 * Get available languages in a survey
 */
export function getAvailableLanguages(surveyKey: SurveyFileKey): string[] {
  if (!checkLocalSurveyExists(surveyKey)) {
    return []
  }

  const surveyData = LOCAL_SURVEYS[surveyKey]
  const languages = new Set<string>()

  const extractLanguages = (obj: any) => {
    if (!obj || typeof obj !== 'object') return

    // Check if this object has language keys
    const languageKeys = ['en', 'es', 'de', 'fr', 'nl', 'es-CO', 'fr-CA', 'de-CH', 'es-AR', 'en-US', 'en-GH', 'default']
    languageKeys.forEach(key => {
      if (key in obj && obj[key]) {
        languages.add(key)
      }
    })

    // Recursively check nested objects and arrays
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        value.forEach(item => extractLanguages(item))
      } else if (typeof value === 'object' && value !== null) {
        extractLanguages(value)
      }
    }
  }

  extractLanguages(surveyData)
  return Array.from(languages).sort()
}
