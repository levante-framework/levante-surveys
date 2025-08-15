/**
 * Centralized language configuration for the Levante Surveys application
 *
 * This configuration is used by:
 * - Frontend Vue components for language selection and display
 * - Node.js scripts for translation extraction and import
 * - Documentation and README generation
 */

/**
 * Supported languages in order of preference
 * Order matters for CSV column generation
 */
export const SUPPORTED_LANGUAGES = ['en', 'es', 'de', 'fr', 'nl']

/**
 * Language metadata with display names and regional variants
 */
export const LANGUAGE_INFO = {
  en: {
    name: 'English',
    nativeName: 'English',
    region: 'US',
    rtl: false
  },
  es: {
    name: 'Spanish',
    nativeName: 'Español',
    region: 'CO',
    rtl: false
  },
  de: {
    name: 'German',
    nativeName: 'Deutsch',
    region: 'DE',
    rtl: false
  },
  fr: {
    name: 'French',
    nativeName: 'Français',
    region: 'CA',
    rtl: false
  },
  nl: {
    name: 'Dutch',
    nativeName: 'Nederlands',
    region: 'NL',
    rtl: false
  }
}

/**
 * Language mapping for survey JSON files
 * Maps language codes to JSON property names
 * Note: Surveys use 'default' instead of 'en' for English
 */
export const JSON_LANGUAGE_MAPPING = {
  'default': 'en',
  'en': 'en',
  'es': 'es',
  'de': 'de',
  'fr': 'fr',
  'nl': 'nl'
}

/**
 * Language mapping for CSV files (from Crowdin/GitHub)
 * Maps CSV column names to survey JSON property names
 */
export const CSV_TO_JSON_MAPPING = {
  'en': 'default',     // CSV 'en' → JSON 'default'
  'es-CO': 'es',       // CSV 'es-CO' → JSON 'es'
  'de': 'de',          // CSV 'de' → JSON 'de'
  'fr-CA': 'fr',       // CSV 'fr-CA' → JSON 'fr'
  'nl': 'nl'           // CSV 'nl' → JSON 'nl'
}

/**
 * Language mapping for extraction (JSON to CSV)
 * Maps survey JSON property names to CSV column names
 */
export const JSON_TO_CSV_MAPPING = {
  'default': 'en',     // JSON 'default' → CSV 'en'
  'en': 'en',          // JSON 'en' → CSV 'en'
  'es': 'es-CO',       // JSON 'es' → CSV 'es-CO'
  'de': 'de',          // JSON 'de' → CSV 'de'
  'fr': 'fr-CA',       // JSON 'fr' → CSV 'fr-CA'
  'nl': 'nl'           // JSON 'nl' → CSV 'nl'
}

/**
 * Get all JSON language properties that can appear in surveys
 */
export function getJsonLanguageKeys() {
  return ['default', ...SUPPORTED_LANGUAGES]
}

/**
 * Get all CSV language columns that can appear in translation files
 */
export function getCsvLanguageColumns() {
  return Object.keys(CSV_TO_JSON_MAPPING)
}

/**
 * Check if a given key is a valid language property in JSON
 */
export function isValidJsonLanguageKey(key) {
  return Object.keys(JSON_LANGUAGE_MAPPING).includes(key)
}

/**
 * Check if a given column is a valid language column in CSV
 */
export function isValidCsvLanguageColumn(column) {
  return Object.keys(CSV_TO_JSON_MAPPING).includes(column)
}

/**
 * Convert JSON language key to display language code
 */
export function jsonKeyToLanguageCode(jsonKey) {
  return JSON_LANGUAGE_MAPPING[jsonKey] || jsonKey
}

/**
 * Convert CSV column to JSON property
 */
export function csvColumnToJsonKey(csvColumn) {
  return CSV_TO_JSON_MAPPING[csvColumn] || csvColumn
}

/**
 * Convert JSON property to CSV column
 */
export function jsonKeyToCsvColumn(jsonKey) {
  return JSON_TO_CSV_MAPPING[jsonKey] || jsonKey
}

/**
 * Get language display name
 */
export function getLanguageDisplayName(languageCode, useNative = false) {
  const info = LANGUAGE_INFO[languageCode]
  if (!info) return languageCode.toUpperCase()
  return useNative ? info.nativeName : info.name
}

/**
 * Get regional variant of language for CSV (e.g., 'es' → 'es-CO')
 */
export function getRegionalLanguageCode(languageCode) {
  const info = LANGUAGE_INFO[languageCode]
  if (!info || !info.region) return languageCode
  return `${languageCode}-${info.region}`
}

// Default export for convenience
export default {
  SUPPORTED_LANGUAGES,
  LANGUAGE_INFO,
  JSON_LANGUAGE_MAPPING,
  CSV_TO_JSON_MAPPING,
  JSON_TO_CSV_MAPPING,
  getJsonLanguageKeys,
  getCsvLanguageColumns,
  isValidJsonLanguageKey,
  isValidCsvLanguageColumn,
  jsonKeyToLanguageCode,
  csvColumnToJsonKey,
  jsonKeyToCsvColumn,
  getLanguageDisplayName,
  getRegionalLanguageCode
}
