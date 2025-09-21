<template>
  <div class="survey-manager">
    <!-- Left Panel - Survey List -->
    <div class="left-panel">
      <div class="panel-header">
        <h1>🔬 Survey Manager <span class="theme-badge">Levante</span></h1>
        <p>Select a local survey to edit (updated versions with multilingual support)</p>
      </div>

      <div class="survey-list">
        <div class="actions">
          <div class="source-controls">
            <label class="select-label">Location</label>
            <select class="select-control" v-model="selectedSource" @change="onSourceChange" :disabled="isLoading">
              <option value="local">Local (updated)</option>
              <option value="dev">Dev (levante-assets-dev)</option>
              <option value="prod">Prod (levante-assets-prod)</option>
              <option value="draft">Draft (levante-assets-draft)</option>
            </select>
            <button :disabled="isLoading" class="btn load-btn" @click="loadAllSurveysAction(selectedSource)">
              {{ isLoading ? 'Loading…' : 'Load Surveys' }}
            </button>
          </div>
          <div class="theme-toggle">
            <label>
              <input type="checkbox" v-model="useLevanteTheme" />
              <span>Use Levante theme</span>
            </label>
          </div>
          <button @click="createNewSurvey" class="btn btn-secondary">
            New Survey
          </button>
        </div>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <div v-if="surveyList.length > 0" class="surveys">
          <h3>Available Surveys ({{ surveyList.length }})</h3>
          <div
            v-for="survey in surveyList"
            :key="survey.key"
            @click="selectSurvey(survey.key)"
            :class="['survey-card', { active: currentSurveyKey === survey.key }]"
          >
            <div class="survey-icon">{{ survey.icon }}</div>
            <div class="survey-info">
              <h4>{{ survey.title }}</h4>
              <p>{{ survey.description }}</p>
              <span class="survey-file">{{ survey.fileName }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Panel - Survey Creator -->
    <div class="right-panel">
      <div class="creator-header">
        <h2 v-if="currentSurveyKey">
          Editing: {{ getSurveyTitle(currentSurveyKey) }}
        </h2>
        <h2 v-else>Survey Creator</h2>
        <div v-if="currentSurveyKey" class="creator-actions">
          <button @click="goBackToPreview" class="btn btn-outline">Back</button>
          <button @click="saveSurvey" class="btn btn-success">Save</button>
        </div>
      </div>

      <div class="creator-container">
        <div v-if="!isCreatorReady" class="creator-placeholder">
          <div class="placeholder-content">
            <h3>🎨 SurveyJS Creator</h3>
            <p>Select a survey from the left panel to start editing, or create a new survey.</p>
          </div>
        </div>

        <div v-else class="creator-wrapper">
          <SurveyCreatorComponent
            ref="surveyCreator"
            :json="currentSurveyJson"
            @surveyChanged="onSurveyChanged"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSurveyStore } from '@/stores/survey'
import { type SurveyFileKey } from '@/constants/bucket'
import SurveyCreatorComponent from '@/components/SurveyCreatorComponent.vue'

const surveyStore = useSurveyStore()
const surveyCreator = ref()
const router = useRouter()

// Computed properties from store
const currentSurveyKey = computed(() => surveyStore.currentSurveyKey)
// const currentSurvey = computed(() => surveyStore.currentSurvey)
const surveyList = computed(() => surveyStore.surveyList)
const isLoading = computed(() => surveyStore.isLoading)
const error = computed(() => surveyStore.error)

// Local state
const isCreatorReady = ref(false)
const currentSurveyJson = ref<any>(null)

// Source selector state
const selectedSource = ref<'local' | 'dev' | 'prod' | 'draft'>('local')
const useLevanteTheme = ref(true)

const onSourceChange = () => {
  // Clear previously cached surveys when switching source to avoid stale data
  surveyStore.clearSurveys()
}

// Load all surveys from selected source
const loadAllSurveysAction = async (source: 'local' | 'dev' | 'prod' = selectedSource.value) => {
  // Prevent multiple simultaneous calls
  if (surveyStore.isLoading) {
    console.log('🔍 Already loading surveys, skipping...')
    return
  }

  try {
    surveyStore.isLoading = true
    surveyStore.error = null

    console.log(`🔍 Starting to load surveys from: ${source}`)

    let surveysObject: Record<string, any> = {}
    if (source === 'local') {
      const localSurveyLoaderModule = await import('@/helpers/localSurveyLoader')
      surveysObject = await localSurveyLoaderModule.loadAllLocalSurveys()
    } else if (source === 'draft') {
      const remoteSurveyLoaderModule = await import('@/helpers/surveyLoader')
      const baseUrl = 'https://storage.googleapis.com/levante-assets-draft/surveys'
      surveysObject = await remoteSurveyLoaderModule.loadAllSurveysFromBase(baseUrl)
    } else {
      const remoteSurveyLoaderModule = await import('@/helpers/surveyLoader')
      const baseUrl = source === 'dev'
        ? 'https://storage.googleapis.com/levante-assets-dev/surveys'
        : 'https://storage.googleapis.com/levante-assets-prod/surveys'
      surveysObject = await remoteSurveyLoaderModule.loadAllSurveysFromBase(baseUrl)
    }

    console.log('🔍 Received surveys:', surveysObject)
    console.log('🔍 Surveys object type:', typeof surveysObject)

    if (!surveysObject || typeof surveysObject !== 'object') {
      throw new Error('Invalid local surveys data received')
    }

    // Update store with loaded surveys
    const surveyKeys = Object.keys(surveysObject)
    if (surveyKeys.length === 0) {
      console.warn('No local surveys found')
      return
    }

    surveyKeys.forEach((key) => {
      surveyStore.setSurvey(key as SurveyFileKey, surveysObject[key])
    })

    console.log(`✅ Successfully loaded ${surveyKeys.length} surveys from ${source}`)
  } catch (err: any) {
    const errorMsg = err?.message || 'Unknown error occurred'
    surveyStore.error = `Failed to load surveys: ${errorMsg}`
    console.error('❌ Error loading surveys:', err)
  } finally {
    surveyStore.isLoading = false
  }
}

// Select and load a survey from current source
const selectSurvey = async (surveyKey: SurveyFileKey) => {
  try {
    surveyStore.isLoading = true
    surveyStore.error = null

    let surveyData = surveyStore.surveys[surveyKey]

    // If not already loaded in memory, fetch from selected source
    if (!surveyData) {
      if (selectedSource.value === 'local') {
        const localSurveyLoaderModule = await import('@/helpers/localSurveyLoader')
        const response = await localSurveyLoaderModule.loadLocalSurvey(surveyKey)
        surveyData = response.data
      } else if (selectedSource.value === 'draft') {
        const remoteSurveyLoaderModule = await import('@/helpers/surveyLoader')
        const baseUrl = 'https://storage.googleapis.com/levante-assets-draft/surveys'
        const response = await remoteSurveyLoaderModule.loadSurveyFromBase(surveyKey, baseUrl)
        surveyData = response.data
      } else {
        const remoteSurveyLoaderModule = await import('@/helpers/surveyLoader')
        const baseUrl = selectedSource.value === 'dev'
          ? 'https://storage.googleapis.com/levante-assets-dev/surveys'
          : 'https://storage.googleapis.com/levante-assets-prod/surveys'
        const response = await remoteSurveyLoaderModule.loadSurveyFromBase(surveyKey, baseUrl)
        surveyData = response.data
      }
      surveyStore.setSurvey(surveyKey, surveyData)
    }

    // Set current survey
    surveyStore.setCurrentSurvey(surveyKey, surveyData)
    currentSurveyJson.value = surveyData

    // Initialize creator
    isCreatorReady.value = true

    console.log(`Loaded local survey: ${surveyKey}`)
  } catch (err: any) {
    surveyStore.error = `Failed to load local survey: ${err?.message || err}`
    console.error('Error loading local survey:', err)
  } finally {
    surveyStore.isLoading = false
  }
}

// Create new survey
const createNewSurvey = () => {
  const newSurvey = {
    title: "New Survey",
    description: "A new survey created with SurveyJS",
    pages: [{
      name: "page1",
      elements: [{
        type: "text",
        name: "question1",
        title: "Your first question"
      }]
    }]
  }

  surveyStore.setCurrentSurvey(null, newSurvey)
  currentSurveyJson.value = newSurvey
  isCreatorReady.value = true
}

// Handle survey changes in creator
const onSurveyChanged = (newJson: any) => {
  currentSurveyJson.value = newJson
  if (surveyStore.currentSurveyKey) {
    surveyStore.setSurvey(surveyStore.currentSurveyKey, newJson)
  }
}

// Preview survey
const previewSurvey = () => {
  // TODO: Implement preview functionality
  console.log('Preview survey:', currentSurveyJson.value)
  alert('Preview functionality coming soon!')
}

// Navigate back to Preview dashboard (root path)
const goBackToPreview = () => {
  router.push({ path: '/' })
}

// Save survey
const saveSurvey = async () => {
  try {
    if (!surveyStore.currentSurveyKey || !currentSurveyJson.value) {
      alert('No survey selected')
      return
    }
    const fileMap = {
      PARENT_FAMILY: 'parent_survey_family.json',
      PARENT_CHILD: 'parent_survey_child.json',
      CHILD: 'child_survey.json',
      TEACHER_GENERAL: 'teacher_survey_general.json',
      TEACHER_CLASSROOM: 'teacher_survey_classroom.json'
    } as const
    const fileName = fileMap[surveyStore.currentSurveyKey]
    const res = await fetch('/api/save-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, json: currentSurveyJson.value })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error || `HTTP ${res.status}`)
    }
    alert('Draft saved to levante-assets-draft/surveys')
  } catch (e: any) {
    console.error('Save failed', e)
    alert(`Save failed: ${e?.message || e}`)
  }
}

// Get survey title by key
const getSurveyTitle = (key: SurveyFileKey) => {
  const survey = surveyStore.surveys[key]
  return survey?.title || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

// Alias for better naming
const loadAllSurveys = () => loadAllSurveysAction(selectedSource.value)

// Initialize on mount
onMounted(() => {
  // Auto-load surveys on component mount
  loadAllSurveys()
  // Apply Levante theme toggle
  watch(useLevanteTheme, (val) => {
    const root = document.documentElement
    if (val) {
      root.style.setProperty('--sjs-font-family', '"Inter", system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif')
      root.style.setProperty('--sjs-primary-backcolor', '#5C6AC4')
      root.style.setProperty('--sjs-primary-forecolor', '#ffffff')
      root.style.setProperty('--sjs-corner-radius', '8px')
    } else {
      root.style.removeProperty('--sjs-font-family')
      root.style.removeProperty('--sjs-primary-backcolor')
      root.style.removeProperty('--sjs-primary-forecolor')
      root.style.removeProperty('--sjs-corner-radius')
    }
  }, { immediate: true })
})
</script>

<style scoped>
.survey-manager {
  display: flex;
  height: 100vh;
  width: 100vw;
  margin: 0;
  padding: 0;
  background: #f8f9fa;
}

.left-panel {
  width: 320px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1rem 1rem 1.25rem 1rem; /* tighter to left edge */
  overflow-y: auto;
  box-shadow: 2px 0 10px rgba(0, 0, 0, 0.08);
}

.right-panel {
  flex: 1;
  background: white;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  min-width: 0; /* Allows flex item to shrink below content size */
}

.panel-header h1 {
  margin: 0 0 0.5rem 0;
  font-size: 1.8rem;
}

.theme-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 0.85rem;
  border-radius: 999px;
  background: #5C6AC4;
  color: #fff;
}

.panel-header p {
  margin: 0 0 1.5rem 0;
  opacity: 0.9;
}

.actions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  align-items: flex-end;
}

.btn {
  padding: 0.75rem 1rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s ease;
  flex: 1;
}

.source-controls { display: flex; gap: 0.5rem; align-items: flex-end; flex: 1; }
.select-label { font-size: 0.8rem; color: #fff; opacity: 0.9; display: block; margin-bottom: 0.25rem; }
.select-control {
  appearance: none;
  background: #fff;
  color: #2c3e50;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
  min-width: 220px;
}
.select-control option { color: #2c3e50; background: #fff; }

.load-btn {
  background: #ffffff;
  color: #2c3e50;
  border: 1px solid #d0d7de;
  width: auto;
}
.load-btn:hover { background: #f6f8fa; }

.theme-toggle { color: #fff; margin-top: 0.5rem; }
.theme-toggle input { margin-right: 6px; }

.btn-secondary {
  background: #28a745;
  color: white;
}

.btn-secondary:hover {
  background: #218838;
}

.btn-outline {
  background: transparent;
  color: #667eea;
  border: 1px solid #667eea;
}

.btn-outline:hover {
  background: #667eea;
  color: white;
}

.btn-success {
  background: #28a745;
  color: white;
}

.btn-success:hover {
  background: #218838;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  background: rgba(220, 53, 69, 0.2);
  color: #fff;
  padding: 0.75rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  border: 1px solid rgba(220, 53, 69, 0.3);
}

.surveys h3 {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  opacity: 0.9;
}

.survey-card {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.survey-card:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateX(4px);
}

.survey-card.active {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.survey-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.survey-info {
  flex: 1;
  min-width: 0;
}

.survey-info h4 {
  margin: 0 0 0.25rem 0;
  font-size: 1rem;
  font-weight: 600;
}

.survey-info p {
  margin: 0 0 0.25rem 0;
  font-size: 0.85rem;
  opacity: 0.8;
  line-height: 1.3;
}

.survey-file {
  font-size: 0.75rem;
  opacity: 0.7;
  font-family: monospace;
}

.creator-header {
  background: white;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e9ecef;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.creator-header h2 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.25rem;
}

.creator-actions {
  display: flex;
  gap: 0.75rem;
}

.creator-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  margin: 0;
  padding: 0;
}

.creator-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8f9fa;
}

.placeholder-content {
  text-align: center;
  color: #6c757d;
  max-width: 400px;
  padding: 2rem;
}

.placeholder-content h3 {
  margin: 0 0 1rem 0;
  font-size: 1.5rem;
}

.placeholder-content p {
  margin: 0;
  line-height: 1.5;
}

.creator-wrapper {
  flex: 1;
  overflow: hidden;
  width: 100%;
  margin: 0;
  padding: 0;
}

@media (max-width: 1024px) {
  .survey-manager {
    flex-direction: column;
    height: auto;
  }

  .left-panel {
    width: 100%;
    max-height: 50vh;
  }

  .right-panel {
    min-height: 50vh;
  }
}
</style>
