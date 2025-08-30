<template>
  <div class="survey-test-page">
    <h1>🔬 Levante Survey Preview Tool</h1>
    <p>Preview and test survey JSON files from development and production environments in all supported languages.</p>

    <div v-if="componentError" class="error-message">
      <h3>Component Error:</h3>
      <pre>{{ componentError }}</pre>
    </div>

    <div class="controls">
      <div class="control-group">
        <label for="bucket-select">Environment:</label>
        <select id="bucket-select" v-model="selectedBucket" @change="onBucketChange" class="control-select">
          <option value="dev">Development (levante-assets-dev)</option>
          <option value="prod">Production (levante-dashboard-prod)</option>
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
        <select id="language-select" v-model="selectedLanguage" @change="changeLanguage" class="control-select">
          <option v-for="lang in supportedLanguages" :key="lang.code" :value="lang.code">
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

    <div
      id="survey-container"
      data-testid="survey-container"
      class="survey-container"
    >
      <p v-if="!selectedSurvey">Please select a survey to test.</p>
      <div v-else-if="currentSurvey">
        <p>Survey: {{ selectedSurvey }} (Language: {{ selectedLanguage }})</p>
        <SurveyComponent :model="currentSurvey" />
      </div>
    </div>

    <div v-if="surveyError" class="error-message">
      <h3>Survey Error:</h3>
      <pre>{{ surveyError }}</pre>
    </div>

    <div v-if="surveyInfo" class="survey-info">
      <h3>Survey Information:</h3>
      <ul>
        <li>Pages: {{ surveyInfo.pageCount }}</li>
        <li>Questions: {{ surveyInfo.questionCount }}</li>
        <li>Languages: {{ surveyInfo.languages.join(', ') }}</li>
        <li>Current Locale: {{ surveyInfo.currentLocale }}</li>
      </ul>
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
    baseUrl: 'https://storage.googleapis.com/levante-assets-dev/surveys'
  },
  prod: {
    name: 'levante-dashboard-prod', 
    baseUrl: 'https://storage.googleapis.com/levante-dashboard-prod/surveys'
  }
}

const loadSelectedSurvey = async () => {
  if (!selectedSurvey.value) {
    clearSurvey()
    return
  }

  try {
    loading.value = true
    surveyError.value = null

    // Load survey JSON from selected bucket
    const config = bucketConfig[selectedBucket.value]
    const surveyUrl = `${config.baseUrl}/${selectedSurvey.value}.json`
    
    console.log(`Loading survey from: ${surveyUrl}`)
    
    const response = await fetch(surveyUrl)
    if (!response.ok) {
      throw new Error(`Failed to load survey from ${config.name}: ${response.status} ${response.statusText}`)
    }

    const surveyData = await response.json()
    loadSurvey(surveyData)
  } catch (error) {
    console.error('Error loading survey:', error)
    surveyError.value = `Error loading from ${bucketConfig[selectedBucket.value].name}: ${error.message}`
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
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.controls {
  margin: 20px 0;
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  align-items: center;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 200px;
}

.control-group label {
  font-weight: 600;
  color: #495057;
  font-size: 14px;
}

.control-select {
  padding: 8px 12px;
  border: 1px solid #ced4da;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
}

.control-select:focus {
  border-color: #007bff;
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.refresh-btn {
  padding: 8px 16px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.15s ease-in-out;
  margin-top: 20px;
}

.refresh-btn:hover:not(:disabled) {
  background: #0056b3;
}

.refresh-btn:disabled {
  background: #6c757d;
  cursor: not-allowed;
}

.survey-container {
  margin: 20px 0;
  min-height: 400px;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 20px;
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
