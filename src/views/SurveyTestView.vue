<template>
  <div class="survey-test-page">
    <h1>Survey Testing Page</h1>
    <p>This page is used for e2e testing of survey JSON files.</p>

    <div class="controls">
      <select v-model="selectedSurvey" @change="loadSelectedSurvey">
        <option value="">Select a survey...</option>
        <option v-for="survey in availableSurveys" :key="survey.value" :value="survey.value">
          {{ survey.label }}
        </option>
      </select>

      <select v-model="selectedLanguage" @change="changeLanguage">
        <option value="en">English</option>
        <option value="es">Spanish</option>
        <option value="de">German</option>
        <option value="fr">French</option>
        <option value="nl">Dutch</option>
        <option value="es_CO">Spanish (Colombia)</option>
        <option value="es_AR">Spanish (Argentina)</option>
        <option value="de_CH">German (Switzerland)</option>
        <option value="fr_CA">French (Canada)</option>
        <option value="en_GH">English (Ghana)</option>
      </select>
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

const selectedSurvey = ref('')
const selectedLanguage = ref('en')
const surveyError = ref(null)
const surveyInfo = ref(null)
const currentSurvey = ref(null)

const availableSurveys = [
  { value: 'child_survey', label: 'Child Survey' },
  { value: 'parent_survey_family', label: 'Parent Survey (Family)' },
  { value: 'parent_survey_child', label: 'Parent Survey (Child)' },
  { value: 'teacher_survey_general', label: 'Teacher Survey (General)' },
  { value: 'teacher_survey_classroom', label: 'Teacher Survey (Classroom)' }
]

const loadSelectedSurvey = async () => {
  if (!selectedSurvey.value) {
    clearSurvey()
    return
  }

  try {
    surveyError.value = null

    // Load survey JSON
    const response = await fetch(`/surveys/${selectedSurvey.value}.json`)
    if (!response.ok) {
      throw new Error(`Failed to load survey: ${response.status}`)
    }

    const surveyData = await response.json()
    loadSurvey(surveyData)
  } catch (error) {
    console.error('Error loading survey:', error)
    surveyError.value = error.message
  }
}

const changeLanguage = () => {
  if (currentSurvey.value) {
    currentSurvey.value.locale = selectedLanguage.value
    updateSurveyInfo()
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
  console.log('SurveyTestView mounted')

  // Expose SurveyJS for Cypress tests
  window.Survey = { Model }
  window.SurveyVue = SurveyComponent

  window.loadSurveyFromData = loadSurvey
  window.clearTestSurvey = clearSurvey
  window.getSurveyInfo = () => surveyInfo.value
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
  gap: 10px;
  flex-wrap: wrap;
}

.controls select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
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
