<template>
  <div class="survey-test-page">
    <nav class="app-nav">
      <div class="nav-brand">
        <h1>🔬 Levante Survey Preview Tool</h1>
      </div>
      <div class="nav-links">
        <router-link to="/manager" class="nav-link">Survey Manager</router-link>
        <router-link to="/about" class="nav-link">About</router-link>
      </div>
    </nav>
    <p class="app-description">Preview and test survey JSON files from development and production environments in all supported languages.</p>

    <div v-if="componentError" class="component-error">
      <h3>Component Error:</h3>
      <pre>{{ componentError }}</pre>
    </div>

    <div class="main-content">
      <!-- Left Sidebar - Controls -->
      <div class="sidebar">
        <div class="sidebar-content">
          <div class="controls">
            <div class="control-group">
              <label for="bucket-select">Environment:</label>
              <select id="bucket-select" v-model="selectedBucket" @change="onBucketChange" class="control-select">
                <option value="dev">Development (levante-assets-dev)</option>
                <option value="legacy-prod">Legacy Production (levante-dashboard-prod)</option>
                <option value="prod">Production (levante-assets-prod) - Coming Soon</option>
              </select>
            </div>

            <div class="control-group">
              <label for="survey-select">Survey:</label>
              <select id="survey-select" v-model="selectedSurvey" @change="loadSelectedSurvey" class="control-select">
                <option value="">Select a survey...</option>
                <option v-for="survey in availableSurveys" :key="survey.value" :value="survey.value">
                  {{ survey.label }}
                </option>
              </select>
            </div>

            <div class="control-group">
              <label for="language-select">Language:</label>
              <select id="language-select" v-model="selectedLanguage" @change="changeLanguage" class="control-select" :disabled="!selectedSurvey || availableLanguages.length === 0">
                <option v-if="availableLanguages.length === 0" value="">Select a survey first</option>
                <option v-for="lang in availableLanguages" :key="lang.code" :value="lang.code">
                  {{ lang.name }} {{ lang.region ? `(${lang.region})` : '' }}
                </option>
              </select>
            </div>

            <div class="control-group" v-if="selectedSurvey">
              <button @click="refreshSurvey" class="refresh-btn" :disabled="loading">
                {{ loading ? 'Loading...' : 'Refresh Survey' }}
              </button>
            </div>
          </div>

          <div class="environment-info" v-if="selectedBucket">
            <div class="info-badge" :class="getBadgeClass(selectedBucket)">
              <strong>{{ bucketConfig[selectedBucket]?.description }}</strong>
              <span class="bucket-name">{{ bucketConfig[selectedBucket]?.name }}</span>
            </div>
          </div>

          <div v-if="surveyError" class="error-message">
            <h4>⚠️ Error</h4>
            <p>{{ surveyError }}</p>
          </div>

          <div v-if="surveyInfo" class="survey-info">
            <h4>📊 Survey Info</h4>
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">Pages:</span>
                <span class="info-value">{{ surveyInfo.pageCount }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Questions:</span>
                <span class="info-value">{{ surveyInfo.questionCount }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Languages:</span>
                <span class="info-value">{{ availableLanguages.length }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Content Area - Survey Preview -->
      <div class="content-area">
        <div
          id="survey-container"
          data-testid="survey-container"
          class="survey-container"
        >
          <div v-if="!selectedSurvey" class="welcome-state">
            <div class="welcome-icon">🔬</div>
            <h2>Welcome to Survey Preview</h2>
            <p>Select an environment and survey from the sidebar to begin previewing.</p>
            <div class="feature-list">
              <div class="feature-item">
                <span class="feature-icon">🌍</span>
                <span>Multi-environment support</span>
              </div>
              <div class="feature-item">
                <span class="feature-icon">🗣️</span>
                <span>Dynamic language detection</span>
              </div>
              <div class="feature-item">
                <span class="feature-icon">📱</span>
                <span>Responsive survey preview</span>
              </div>
            </div>
          </div>
          <div v-else-if="currentSurvey" class="survey-preview">
            <div class="survey-header">
              <div class="survey-title">
                <h2>{{ selectedSurvey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }}</h2>
                <div class="survey-badges">
                  <span class="badge badge-language">{{ getSurveyLanguageDisplay() }}</span>
                  <span class="badge badge-env" :class="getBadgeClass(selectedBucket)">{{ bucketConfig[selectedBucket]?.description }}</span>
                </div>
              </div>
            </div>
            <div class="survey-content">
              <SurveyComponent :model="currentSurvey" />
            </div>
          </div>
        </div>
      </div>
    </div>


  </div>
</template>

<!-- eslint-disable vue/block-lang -->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { SurveyComponent } from 'survey-vue3-ui'
import { Model } from 'survey-core'
import { LANGUAGE_INFO } from '../constants/languages.js'

const selectedSurvey = ref('')
const selectedLanguage = ref('en')
const selectedBucket = ref('dev')
const surveyError = ref(null)
const surveyInfo = ref(null)
const currentSurvey = ref(null)
const componentError = ref(null)
const loading = ref(false)
const availableLanguages = ref([])
const rawSurveyData = ref(null)

const availableSurveys = [
  { value: 'child_survey', label: 'Child Survey' },
  { value: 'parent_survey_family', label: 'Parent Survey (Family)' },
  { value: 'parent_survey_child', label: 'Parent Survey (Child)' },
  { value: 'teacher_survey_general', label: 'Teacher Survey (General)' },
  { value: 'teacher_survey_classroom', label: 'Teacher Survey (Classroom)' }
]

// Generate supported languages from LANGUAGE_INFO
const supportedLanguages = Object.entries(LANGUAGE_INFO).map(([code, info]) => ({
  code,
  name: info.name,
  region: info.region
}))

// Bucket configuration
const bucketConfig = {
  dev: {
    name: 'levante-assets-dev',
    baseUrl: 'https://storage.googleapis.com/levante-assets-dev/surveys',
    description: 'Development Environment'
  },
  'legacy-prod': {
    name: 'levante-dashboard-prod',
    baseUrl: 'https://storage.googleapis.com/levante-dashboard-prod',
    description: 'Legacy Production Environment'
  },
  prod: {
    name: 'levante-assets-prod',
    baseUrl: 'https://storage.googleapis.com/levante-assets-prod/surveys',
    description: 'Production Environment (Future)'
  }
}

const loadSelectedSurvey = async () => {
  if (!selectedSurvey.value) {
    clearSurvey()
    return
  }

  // Check if trying to use the future prod bucket
  if (selectedBucket.value === 'prod') {
    surveyError.value = 'Production bucket (levante-assets-prod) is not yet available. Please use Development or Legacy Production.'
    return
  }

  try {
    loading.value = true
    surveyError.value = null

    // Load survey JSON from selected bucket
    const config = bucketConfig[selectedBucket.value]
    const surveyUrl = `${config.baseUrl}/${selectedSurvey.value}.json`

    console.log(`Loading survey from ${config.description}: ${surveyUrl}`)

    const response = await fetch(surveyUrl)
    if (!response.ok) {
      throw new Error(`Failed to load survey from ${config.name}: ${response.status} ${response.statusText}`)
    }

    const surveyData = await response.json()
    rawSurveyData.value = surveyData
    extractAvailableLanguages(surveyData)
    loadSurvey(surveyData)
  } catch (error) {
    console.error('Error loading survey:', error)
    surveyError.value = `Error loading from ${bucketConfig[selectedBucket.value].description}: ${error.message}`
  } finally {
    loading.value = false
  }
}

const changeLanguage = () => {
  if (currentSurvey.value) {
    currentSurvey.value.locale = selectedLanguage.value
    updateSurveyInfo()
  }
}

const onBucketChange = () => {
  // Reload survey if one is selected when bucket changes
  if (selectedSurvey.value) {
    loadSelectedSurvey()
  }
}

const refreshSurvey = () => {
  if (selectedSurvey.value) {
    loadSelectedSurvey()
  }
}

const getBadgeClass = (bucket) => {
  switch (bucket) {
    case 'dev':
      return 'badge-dev'
    case 'legacy-prod':
      return 'badge-legacy-prod'
    case 'prod':
      return 'badge-prod-future'
    default:
      return 'badge-default'
  }
}

const getSurveyLanguageDisplay = () => {
  const lang = availableLanguages.value.find(l => l.code === selectedLanguage.value)
  return lang ? `${lang.name}${lang.region ? ` (${lang.region})` : ''}` : selectedLanguage.value
}

const extractAvailableLanguages = (surveyData) => {
  const languages = new Set()

  // Helper function to recursively find all language keys
  const findLanguageKeys = (obj) => {
    if (typeof obj !== 'object' || obj === null) return

    // Check if this object has language properties
    if (obj.hasOwnProperty('default')) {
      // This is a localized object, collect all language keys
      Object.keys(obj).forEach(key => {
        if (key !== 'default') {
          languages.add(key)
        }
      })
      // Always include English/default
      languages.add('en')
    } else {
      // Recursively check nested objects
      Object.values(obj).forEach(value => {
        if (typeof value === 'object') {
          findLanguageKeys(value)
        }
      })
    }
  }

  findLanguageKeys(surveyData)

  // Convert to array and prioritize regional codes over base language codes
  const langCodes = Array.from(languages)

  // Create a priority system: regional codes (with hyphens) come first
  const prioritizedCodes = langCodes.sort((a, b) => {
    const aHasRegion = a.includes('-')
    const bHasRegion = b.includes('-')

    // If one has a region and the other doesn't, prioritize the regional one
    if (aHasRegion && !bHasRegion) return -1
    if (!aHasRegion && bHasRegion) return 1

    // Otherwise sort alphabetically
    return a.localeCompare(b)
  })

  console.log('Found language codes:', prioritizedCodes)

  availableLanguages.value = prioritizedCodes
    .map(code => {
      // Handle 'en' -> 'default' mapping
      const displayCode = code === 'en' ? 'default' : code
      const info = LANGUAGE_INFO[code] || { name: code.toUpperCase(), region: null }

      // For unknown codes, try to create a readable name
      let displayName = info.name
      if (!info.name || info.name === code) {
        if (code.includes('-')) {
          const [lang, region] = code.split('-')
          displayName = `${lang.toUpperCase()} (${region.toUpperCase()})`
        } else {
          displayName = code.toUpperCase()
        }
      }

      return {
        code: displayCode,
        name: displayName,
        region: info.region
      }
    })
    .sort((a, b) => {
      // Put English first
      if (a.code === 'default') return -1
      if (b.code === 'default') return 1

      // Then prioritize regional codes
      const aHasRegion = a.code.includes('-')
      const bHasRegion = b.code.includes('-')

      if (aHasRegion && !bHasRegion) return -1
      if (!aHasRegion && bHasRegion) return 1

      return a.name.localeCompare(b.name)
    })

  console.log('Available languages:', availableLanguages.value)

  // Set default language to English if available, otherwise first available
  if (availableLanguages.value.length > 0) {
    const hasEnglish = availableLanguages.value.some(lang => lang.code === 'default')
    selectedLanguage.value = hasEnglish ? 'default' : availableLanguages.value[0].code
  }
}

const loadSurvey = async (surveyData) => {
  try {
    // Clear any existing survey
    clearSurvey()

    // Create new survey instance
    const surveyModel = new Model(surveyData)

    // Set initial language
    surveyModel.locale = selectedLanguage.value

    // Set reactive reference
    currentSurvey.value = surveyModel

    // Add to window for Cypress access
    window.testSurvey = surveyModel

    // Update survey info
    updateSurveyInfo()

  } catch (error) {
    console.error('Error creating survey:', error)
    surveyError.value = error.message
  }
}

const updateSurveyInfo = () => {
  if (!currentSurvey.value) {
    surveyInfo.value = null
    return
  }

  // Extract language information from survey data
  const surveyString = JSON.stringify(currentSurvey.value.toJSON())
  const languages = []

  // Check for various language patterns
  if (surveyString.includes('"default":') || surveyString.includes('"en":')) languages.push('en')
  if (surveyString.includes('"es":')) languages.push('es')
  if (surveyString.includes('"de":')) languages.push('de')
  if (surveyString.includes('"fr":')) languages.push('fr')
  if (surveyString.includes('"nl":')) languages.push('nl')
  if (surveyString.includes('"es_CO":')) languages.push('es_CO')
  if (surveyString.includes('"es_AR":')) languages.push('es_AR')
  if (surveyString.includes('"de_CH":')) languages.push('de_CH')
  if (surveyString.includes('"fr_CA":')) languages.push('fr_CA')
  if (surveyString.includes('"en_GH":')) languages.push('en_GH')

  surveyInfo.value = {
    pageCount: currentSurvey.value.pages.length,
    questionCount: currentSurvey.value.getAllQuestions().length,
    languages: [...new Set(languages)],
    currentLocale: currentSurvey.value.locale
  }
}

const clearSurvey = () => {
  currentSurvey.value = null
  window.testSurvey = null
  surveyInfo.value = null
  surveyError.value = null
}

onMounted(() => {
  try {
    console.log('SurveyTestView mounted successfully')
    console.log('SurveyJS Model available:', !!Model)
    console.log('SurveyComponent available:', !!SurveyComponent)

    if (!Model || !SurveyComponent) {
      throw new Error('SurveyJS components not available')
    }

    // Expose SurveyJS for Cypress tests
    window.Survey = { Model }
    window.SurveyVue = SurveyComponent

    window.loadSurveyFromData = loadSurvey
    window.clearTestSurvey = clearSurvey
    window.getSurveyInfo = () => surveyInfo.value

    // Add a flag to indicate the component is ready
    window.surveyTestViewReady = true
    console.log('SurveyTestView setup complete, window functions exposed')
  } catch (error) {
    console.error('Error in SurveyTestView onMounted:', error)
    componentError.value = error.message
  }
})

onUnmounted(() => {
  clearSurvey()
  delete window.Survey
  delete window.SurveyVue
  delete window.loadSurveyFromData
  delete window.clearTestSurvey
  delete window.getSurveyInfo
  delete window.testSurvey
})
</script>

<style scoped>
.survey-test-page {
  padding: 0;
  margin: 0;
  min-height: 100vh;
  width: 100vw;
  max-width: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  background-attachment: fixed;
  overflow-x: hidden;
}

.app-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 30px;
  width: 100%;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
}

.nav-brand h1 {
  margin: 0;
  color: #2d3748;
  font-size: 28px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.nav-links {
  display: flex;
  gap: 15px;
}

.nav-link {
  padding: 10px 20px;
  text-decoration: none;
  color: #4a5568;
  border-radius: 25px;
  font-weight: 600;
  transition: all 0.3s ease;
  background: rgba(255, 255, 255, 0.7);
}

.nav-link:hover {
  background: rgba(102, 126, 234, 0.1);
  color: #667eea;
  transform: translateY(-2px);
}

.nav-link.router-link-active {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.app-description {
  padding: 0 30px 20px;
  width: 100%;
  color: rgba(255, 255, 255, 0.9);
  font-size: 16px;
  text-align: center;
  font-weight: 300;
}

.component-error {
  margin: 0 30px 20px;
  padding: 20px;
  background: rgba(239, 68, 68, 0.1);
  border: 2px solid rgba(239, 68, 68, 0.3);
  border-radius: 15px;
  color: #dc2626;
}

.main-content {
  display: flex;
  height: calc(100vh - 140px);
  width: 100%;
  gap: 0;
}

.sidebar {
  flex: 0 0 380px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-right: 1px solid rgba(255, 255, 255, 0.2);
  overflow-y: auto;
  height: 100%;
}

.sidebar-content {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.content-area {
  flex: 1;
  background: rgba(255, 255, 255, 0.98);
  overflow-y: auto;
  height: 100%;
}

.controls {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 15px;
  border: 1px solid rgba(102, 126, 234, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-group label {
  font-weight: 700;
  color: #2d3748;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.control-select {
  padding: 12px 16px;
  border: 2px solid rgba(102, 126, 234, 0.2);
  border-radius: 10px;
  font-size: 14px;
  background: white;
  transition: all 0.3s ease;
  font-weight: 500;
}

.control-select:focus {
  border-color: #667eea;
  outline: 0;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  transform: translateY(-1px);
}

.control-select:disabled {
  background: #f7fafc;
  color: #a0aec0;
  cursor: not-allowed;
}

.refresh-btn {
  padding: 12px 24px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.3s ease;
  margin-top: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.refresh-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
}

.refresh-btn:disabled {
  background: #a0aec0;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.control-select option[value="prod"] {
  color: #6c757d;
  font-style: italic;
}

.environment-info {
  margin: 0 0 25px 0;
}

.info-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  border-radius: 15px;
  font-size: 14px;
  text-align: center;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.info-badge:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.info-badge.badge-dev {
  background: rgba(59, 130, 246, 0.1);
  border: 2px solid rgba(59, 130, 246, 0.3);
  color: #1d4ed8;
}

.info-badge.badge-legacy-prod {
  background: rgba(245, 158, 11, 0.1);
  border: 2px solid rgba(245, 158, 11, 0.3);
  color: #b45309;
}

.info-badge.badge-prod-future {
  background: rgba(168, 85, 247, 0.1);
  border: 2px solid rgba(168, 85, 247, 0.3);
  color: #7c3aed;
}

.bucket-name {
  font-size: 11px;
  font-family: 'Monaco', 'Menlo', monospace;
  margin-top: 8px;
  opacity: 0.7;
  font-weight: 500;
}

.error-message {
  background: rgba(239, 68, 68, 0.1);
  border: 2px solid rgba(239, 68, 68, 0.3);
  border-radius: 15px;
  padding: 20px;
  margin: 20px 0;
  box-shadow: 0 4px 15px rgba(239, 68, 68, 0.1);
}

.error-message h4 {
  color: #dc2626;
  margin: 0 0 10px 0;
  font-size: 16px;
  font-weight: 700;
}

.error-message p {
  color: #991b1b;
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

.survey-info {
  background: rgba(16, 185, 129, 0.1);
  border: 2px solid rgba(16, 185, 129, 0.3);
  border-radius: 15px;
  padding: 20px;
  margin: 20px 0;
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.1);
}

.survey-info h4 {
  color: #047857;
  margin: 0 0 15px 0;
  font-size: 16px;
  font-weight: 700;
}

.info-grid {
  display: grid;
  gap: 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(16, 185, 129, 0.2);
}

.info-item:last-child {
  border-bottom: none;
}

.info-label {
  color: #065f46;
  font-weight: 600;
  font-size: 13px;
}

.info-value {
  color: #047857;
  font-weight: 700;
  font-size: 14px;
}

.survey-container {
  margin: 0;
  height: 100%;
  padding: 0;
  background: transparent;
  display: flex;
  flex-direction: column;
}

.welcome-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  padding: 60px 40px;
  flex: 1;
}

.welcome-icon {
  font-size: 80px;
  margin-bottom: 30px;
  opacity: 0.8;
}

.welcome-state h2 {
  color: #2d3748;
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 15px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.welcome-state p {
  color: #4a5568;
  font-size: 18px;
  margin-bottom: 40px;
  max-width: 500px;
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 400px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px 20px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 15px;
  border: 1px solid rgba(102, 126, 234, 0.2);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.feature-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.feature-icon {
  font-size: 24px;
}

.survey-preview {
  height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.survey-header {
  padding: 30px 40px 20px;
  background: rgba(255, 255, 255, 0.95);
  border-bottom: 1px solid rgba(102, 126, 234, 0.2);
}

.survey-title h2 {
  color: #2d3748;
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 15px 0;
}

.survey-badges {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.badge {
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge-language {
  background: rgba(52, 211, 153, 0.2);
  color: #047857;
  border: 1px solid rgba(52, 211, 153, 0.3);
}

.badge-env.badge-dev {
  background: rgba(59, 130, 246, 0.2);
  color: #1d4ed8;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.badge-env.badge-legacy-prod {
  background: rgba(245, 158, 11, 0.2);
  color: #b45309;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.badge-env.badge-prod-future {
  background: rgba(168, 85, 247, 0.2);
  color: #7c3aed;
  border: 1px solid rgba(168, 85, 247, 0.3);
}

.survey-content {
  flex: 1;
  padding: 20px 40px 40px;
  background: white;
  overflow-y: auto;
}

.error-message {
  background: #fee;
  border: 1px solid #fcc;
  border-radius: 4px;
  padding: 15px;
  margin: 20px 0;
  color: #c33;
}

.error-message pre {
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 12px;
}

.survey-info {
  background: #f0f8ff;
  border: 1px solid #cce;
  border-radius: 4px;
  padding: 15px;
  margin: 20px 0;
}

.survey-info ul {
  margin: 10px 0;
  padding-left: 20px;
}

.survey-info li {
  margin: 5px 0;
}
</style>
