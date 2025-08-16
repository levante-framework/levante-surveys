/**
 * Google Cloud Storage bucket configuration
 * Uses environment variable to determine which bucket to use
 */
export const LEVANTE_BUCKET_URL =
  import.meta.env.VITE_FIREBASE_PROJECT === 'road-dashboard'
    ? 'https://storage.googleapis.com/road-dashboard'
    : 'https://storage.googleapis.com/levante-dashboard-dev'

/**
 * Available survey files in the bucket
 */
export const SURVEY_FILES = {
  PARENT_FAMILY: 'parent_survey_family.json',
  PARENT_CHILD: 'parent_survey_child.json',
  CHILD: 'child_survey.json',
  TEACHER_GENERAL: 'teacher_survey_general.json',
  TEACHER_CLASSROOM: 'teacher_survey_classroom.json'
} as const

export type SurveyFileKey = keyof typeof SURVEY_FILES
export type SurveyFileName = typeof SURVEY_FILES[SurveyFileKey]

/**
 * Get the full URL for a survey file
 */
export function getSurveyUrl(surveyKey: SurveyFileKey): string {
  return `${LEVANTE_BUCKET_URL}/${SURVEY_FILES[surveyKey]}`
}

/**
 * Get survey key from filename
 */
export function getSurveyKeyFromFilename(filename: SurveyFileName): SurveyFileKey | null {
  const entry = Object.entries(SURVEY_FILES).find(([_, value]) => value === filename)
  return entry ? entry[0] as SurveyFileKey : null
}

/**
 * Validate if a survey key is valid
 */
export function isValidSurveyKey(key: string): key is SurveyFileKey {
  return key in SURVEY_FILES
}
