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
      <p v-else>Survey: {{ selectedSurvey }} (Language: {{ selectedLanguage }})</p>
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

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const selectedSurvey = ref('')
const selectedLanguage = ref('en')
const surveyError = ref(null)
const surveyInfo = ref(null)
let currentSurvey = null

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
  if (currentSurvey) {
    currentSurvey.locale = selectedLanguage.value
    updateSurveyInfo()
  }
}

const loadSurvey = async (surveyData) => {
  try {
    // Clear any existing survey
    clearSurvey()

    // Dynamically import SurveyJS to avoid blocking component render
    const { Survey } = await import('survey-vue3-ui')
    const { Model } = await import('survey-core')

    // Create new survey instance
    currentSurvey = new Model(surveyData)

    // Set initial language
    currentSurvey.locale = selectedLanguage.value

    // Add to window for Cypress access
    window.testSurvey = currentSurvey

    // Render survey
    const surveyContainer = document.getElementById('survey-container')
    if (surveyContainer) {
      const surveyComponent = new Survey(currentSurvey)
      surveyComponent.render(surveyContainer)
    }

    // Update survey info
    updateSurveyInfo()

  } catch (error) {
    console.error('Error creating survey:', error)
    surveyError.value = error.message
  }
}

const updateSurveyInfo = () => {
  if (!currentSurvey) {
    surveyInfo.value = null
    return
  }

  // Extract language information from survey data
  const surveyString = JSON.stringify(currentSurvey.toJSON())
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
    pageCount: currentSurvey.pages.length,
    questionCount: currentSurvey.getAllQuestions().length,
    languages: [...new Set(languages)],
    currentLocale: currentSurvey.locale
  }
}

const clearSurvey = () => {
  const container = document.getElementById('survey-container')
  if (container) {
    container.innerHTML = ''
  }
  currentSurvey = null
  window.testSurvey = null
  surveyInfo.value = null
  surveyError.value = null
}

onMounted(async () => {
  console.log('SurveyTestView mounted')

  try {
    // Dynamically import SurveyJS for Cypress tests
    const { Survey } = await import('survey-vue3-ui')
    const { Model } = await import('survey-core')

    // Expose SurveyJS for Cypress tests
    window.Survey = { Model }
    window.SurveyVue = Survey
  } catch (error) {
    console.error('Failed to load SurveyJS:', error)
    // Provide fallback objects
    window.Survey = { Model: {} }
    window.SurveyVue = {}
  }

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
