import axios from 'axios'
import { LEVANTE_BUCKET_URL, SURVEY_FILES, type SurveyFileKey } from '@/constants/bucket'

// Survey response from GCS
export interface SurveyResponse {
  data: any
  metadata: {
    size: number
    lastModified?: string
    contentType?: string
  }
}

/**
 * Load a specific survey from the GCS bucket
 */
export async function loadSurveyFromBucket(surveyKey: SurveyFileKey): Promise<SurveyResponse> {
  const fileName = SURVEY_FILES[surveyKey]
  const url = `${LEVANTE_BUCKET_URL}/${fileName}?_t=${Date.now()}`

  try {
    console.log(`Loading survey from: ${url}`)

    const response = await axios.get(url, { timeout: 10000 })

    if (!response.data) {
      throw new Error(`No data received for survey: ${fileName}`)
    }

    return {
      data: response.data,
      metadata: {
        size: JSON.stringify(response.data).length,
        lastModified: response.headers['last-modified'],
        contentType: response.headers['content-type']
      }
    }
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        throw new Error(`Survey file not found: ${fileName}`)
      } else if (error.code === 'ECONNABORTED') {
        throw new Error(`Request timeout loading survey: ${fileName}`)
      } else {
        throw new Error(`Network error loading survey ${fileName}: ${error.message}`)
      }
    }
    throw new Error(`Error loading survey ${fileName}: ${error?.message || error}`)
  }
}

/**
 * Load a specific survey from a provided base URL (e.g., dev/prod buckets)
 */
export async function loadSurveyFromBase(
  surveyKey: SurveyFileKey,
  baseUrl: string
): Promise<SurveyResponse> {
  const fileName = SURVEY_FILES[surveyKey]
  const url = `${baseUrl.replace(/\/$/, '')}/${fileName}?_t=${Date.now()}`

  try {
    console.log(`Loading survey from (base): ${url}`)
    const response = await axios.get(url, { timeout: 10000 })

    if (!response.data) {
      throw new Error(`No data received for survey: ${fileName}`)
    }

    return {
      data: response.data,
      metadata: {
        size: JSON.stringify(response.data).length,
        lastModified: response.headers['last-modified'],
        contentType: response.headers['content-type']
      }
    }
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        throw new Error(`Survey file not found: ${fileName}`)
      } else if (error.code === 'ECONNABORTED') {
        throw new Error(`Request timeout loading survey: ${fileName}`)
      } else {
        throw new Error(`Network error loading survey ${fileName}: ${error.message}`)
      }
    }
    throw new Error(`Error loading survey ${fileName}: ${error?.message || error}`)
  }
}

/**
 * Load all available surveys from the GCS bucket
 */
export async function loadAllSurveys(): Promise<Record<SurveyFileKey, any>> {
  try {
    console.log('🔍 DEBUG: loadAllSurveys() called')
    console.log('🔍 DEBUG: LEVANTE_BUCKET_URL =', LEVANTE_BUCKET_URL)
    console.log('🔍 DEBUG: SURVEY_FILES =', SURVEY_FILES)

    const surveys: Record<SurveyFileKey, any> = {}
    console.log('🔍 DEBUG: Initialized surveys object =', surveys)

    const errors: string[] = []
    const surveyKeys = Object.keys(SURVEY_FILES) as SurveyFileKey[]
    console.log('🔍 DEBUG: Survey keys =', surveyKeys)

    // Load surveys in parallel
    const promises = surveyKeys.map(async (key) => {
      try {
        console.log(`🔍 DEBUG: Attempting to load survey: ${key}`)
        const response = await loadSurveyFromBucket(key)
        surveys[key] = response.data
        console.log(`✅ Loaded survey: ${key}`)
      } catch (error: any) {
        const errorMsg = `❌ Failed to load ${key}: ${error?.message || error}`
        errors.push(errorMsg)
        console.warn(errorMsg)
      }
    })

    await Promise.allSettled(promises)

    const loadedCount = Object.keys(surveys).length
    console.log('🔍 DEBUG: Final surveys object =', surveys)
    console.log('🔍 DEBUG: Object.keys(surveys) =', Object.keys(surveys))
    console.log('🔍 DEBUG: Loaded count =', loadedCount)

    if (errors.length > 0) {
      console.warn(`Loaded ${loadedCount}/${surveyKeys.length} surveys. Errors:`, errors)
    } else {
      console.log(`✅ Successfully loaded all ${loadedCount} surveys`)
    }

    console.log('🔍 DEBUG: About to return surveys =', surveys)
    return surveys
  } catch (error: any) {
    console.error('🔍 DEBUG: Error in loadAllSurveys:', error)
    console.error('🔍 DEBUG: Error stack:', error?.stack)
    throw error
  }
}

/**
 * Load all surveys from a provided base URL (e.g., dev/prod buckets)
 */
export async function loadAllSurveysFromBase(baseUrl: string): Promise<Record<SurveyFileKey, any>> {
  try {
    const surveys: Record<SurveyFileKey, any> = {}
    const errors: string[] = []
    const surveyKeys = Object.keys(SURVEY_FILES) as SurveyFileKey[]

    const promises = surveyKeys.map(async (key) => {
      try {
        const response = await loadSurveyFromBase(key, baseUrl)
        surveys[key] = response.data
      } catch (error: any) {
        const errorMsg = `❌ Failed to load ${key}: ${error?.message || error}`
        errors.push(errorMsg)
        console.warn(errorMsg)
      }
    })

    await Promise.allSettled(promises)

    if (errors.length > 0) {
      console.warn(`Loaded ${Object.keys(surveys).length}/${surveyKeys.length} surveys from ${baseUrl}`)
    }

    return surveys
  } catch (error) {
    throw error
  }
}

/**
 * Check if a survey exists in the bucket
 */
export async function checkSurveyExists(surveyKey: SurveyFileKey): Promise<boolean> {
  const fileName = SURVEY_FILES[surveyKey]
  const url = `${LEVANTE_BUCKET_URL}/${fileName}?_t=${Date.now()}`

  try {
    const response = await axios.head(url, { timeout: 5000, headers: { 'Cache-Control': 'no-cache' } })
    return response.status === 200
  } catch {
    return false
  }
}

/**
 * Get survey metadata without downloading the full content
 */
export async function getSurveyMetadata(surveyKey: SurveyFileKey) {
  const fileName = SURVEY_FILES[surveyKey]
  const url = `${LEVANTE_BUCKET_URL}/${fileName}?_t=${Date.now()}`

  try {
    const response = await axios.head(url, { timeout: 5000, headers: { 'Cache-Control': 'no-cache' } })
    return {
      exists: true,
      size: response.headers['content-length'],
      lastModified: response.headers['last-modified'],
      contentType: response.headers['content-type'],
      etag: response.headers['etag']
    }
  } catch (error: any) {
    return {
      exists: false,
      error: error?.message || error
    }
  }
}

/**
 * Extract text from multilingual objects with language priority
 * Prioritizes: selected language -> English -> default -> first available
 */
export function extractText(textObj: any, preferredLanguage: string = 'en'): string {
  if (!textObj) return ''

  // If it's already a string, return as-is
  if (typeof textObj === 'string') {
    // Handle common Spanish boolean terms
    if (textObj.toLowerCase() === 'sí' || textObj.toLowerCase() === 'si' || textObj.toLowerCase() === 'sì') {
      return 'Yes'
    }
    if (textObj.toLowerCase() === 'no') {
      return 'No'
    }
    return textObj
  }

  // If it's not an object, convert to string
  if (typeof textObj !== 'object') {
    return String(textObj)
  }

  // Priority order: preferred language -> English -> default -> other languages (but skip Spanish)
  const priorities = [
    preferredLanguage,
    'en',
    'default',
    ...Object.keys(textObj).filter(key =>
      key !== preferredLanguage &&
      key !== 'en' &&
      key !== 'default' &&
      key !== 'es' // Skip Spanish entirely
    )
  ]

  for (const key of priorities) {
    if (textObj[key]) {
      const text = String(textObj[key])
      // Convert Spanish boolean terms to English
      if (text.toLowerCase() === 'sí' || text.toLowerCase() === 'si' || text.toLowerCase() === 'sì') {
        return 'Yes'
      }
      if (text.toLowerCase() === 'no') {
        return 'No'
      }
      return text
    }
  }

  // Fallback: return first available value (excluding Spanish)
  const nonSpanishKeys = Object.keys(textObj).filter(key => key !== 'es')
  if (nonSpanishKeys.length > 0) {
    const text = String(textObj[nonSpanishKeys[0]])
    // Convert Spanish boolean terms to English
    if (text.toLowerCase() === 'sí' || text.toLowerCase() === 'si' || text.toLowerCase() === 'sì') {
      return 'Yes'
    }
    if (text.toLowerCase() === 'no') {
      return 'No'
    }
    return text
  }

  return ''
}

/**
 * Parse HTML content to plain text for display
 */
export function parseHtmlToText(html: string): string {
  if (!html) return ''

  // Remove HTML tags and decode entities
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Non-breaking spaces
    .replace(/&amp;/g, '&') // Ampersands
    .replace(/&lt;/g, '<') // Less than
    .replace(/&gt;/g, '>') // Greater than
    .replace(/&quot;/g, '"') // Quotes
    .replace(/&#39;/g, "'") // Apostrophes
    .replace(/&apos;/g, "'") // Apostrophes (alternative)
    .replace(/\s+/g, ' ') // Multiple spaces to single space
    .trim()
}
