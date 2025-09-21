<template>
  <div class="survey-creator">
    <div ref="creatorContainer" class="creator-container">
      <SurveyCreatorVue
        v-if="isReady && creatorModel"
        :model="creatorModel"
        @surveyChanged="onSurveyChanged"
      />
      <div v-else class="loading-placeholder">
        <div class="loading-content">
          <h3>🎨 Initializing Survey Creator...</h3>
          <p>Setting up the visual survey editor</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { SurveyCreatorComponent as SurveyCreatorVue } from 'survey-creator-vue'
import { SurveyCreatorModel, CreatorThemes } from 'survey-creator-core'
import 'survey-creator-core/survey-creator-core.css'
import { settings as SurveySettings, slk } from 'survey-core'
import { settings as CreatorSettings } from 'survey-creator-core'

interface Props {
  json?: any
}

interface Emits {
  (e: 'surveyChanged', json: any): void
  (e: 'creatorReady', creator: SurveyCreatorModel): void
}

const props = withDefaults(defineProps<Props>(), {
  json: () => ({})
})

const emit = defineEmits<Emits>()

const creatorContainer = ref<HTMLElement>()
const isReady = ref(false)
const creatorModel = ref<SurveyCreatorModel | null>(null)

// Initialize the SurveyJS Creator
const initializeCreator = async () => {
  try {
    // Apply SurveyJS license key if provided via env
    const licenseKey = import.meta.env.VITE_SURVEYJS_LICENSE_KEY
    if (licenseKey && typeof licenseKey === 'string') {
      try {
        slk(licenseKey)
        // @ts-ignore - settings.license can be set at runtime (back-compat)
        SurveySettings.license = licenseKey
        // @ts-ignore
        CreatorSettings.license = licenseKey
        console.log('✅ SurveyJS license key applied')
      } catch (e) {
        console.warn('⚠️ Failed to apply SurveyJS license key:', (e as Error).message)
      }
    }

    // Create SurveyCreator instance with options (Theme tab enabled at construction)
    creatorModel.value = new SurveyCreatorModel({
      showLogicTab: true,
      showJSONEditorTab: true,
      showTestSurveyTab: true,
      showTranslationTab: true,
      // Theme tab must be enabled via constructor in v2
      // @ts-expect-error: not in older type defs
      showThemeTab: true,
      // Allow selecting themes in Preview as in demo
      // @ts-expect-error
      previewAllowSelectTheme: true
    } as any)

    // Ensure Creator themes are registered so the Theme tab has choices
    try {
      // touch CreatorThemes to ensure tree-shaking doesn’t drop presets
      const themeNames = Object.keys(CreatorThemes || {})
      if (themeNames.length > 0) {
        // no-op; ensures import side-effects run
      }
    } catch {}

    // Configure creator options (post-construction toggles)
    creatorModel.value.showLogicTab = true
    creatorModel.value.showJSONEditorTab = true
    creatorModel.value.showTestSurveyTab = true
    creatorModel.value.showTranslationTab = true
    // Allow selecting themes in Preview explicitly
    // @ts-ignore
    ;(creatorModel.value as any).allowChangeThemeInPreview = true

    // Handle survey changes
    creatorModel.value.onModified.add((sender: SurveyCreatorModel) => {
      const surveyJSON = sender.JSON
      emit('surveyChanged', surveyJSON)
    })

    // Set initial JSON if provided
    if (props.json && Object.keys(props.json).length > 0) {
      creatorModel.value.JSON = props.json
    }

    // Mark as ready
    isReady.value = true

    emit('creatorReady', creatorModel.value)

    console.log('SurveyJS Creator initialized successfully')
  } catch (error) {
    console.error('Error initializing SurveyJS Creator:', error)
  }
}

// Update creator when JSON prop changes
watch(() => props.json, (newJson) => {
  if (creatorModel.value && newJson && Object.keys(newJson).length > 0) {
    creatorModel.value.JSON = newJson
  }
}, { deep: true })

// Handle survey changes from the Vue component
const onSurveyChanged = (newJson: any) => {
  emit('surveyChanged', newJson)
}

// Expose creator methods
const getCreatorJSON = () => {
  return creatorModel.value?.JSON || {}
}

const setCreatorJSON = (json: any) => {
  if (creatorModel.value) {
    creatorModel.value.JSON = json
  }
}

const isModified = () => {
  // Note: isModified property may not exist in newer versions
  return false
}

// Lifecycle
onMounted(async () => {
  await nextTick()
  initializeCreator()
})

// Expose methods to parent
defineExpose({
  getCreatorJSON,
  setCreatorJSON,
  isModified,
  creator: () => creatorModel.value
})
</script>

<style scoped>
.survey-creator {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.creator-container {
  height: 100%;
  width: 100%;
}

.loading-placeholder {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8f9fa;
}

.loading-content {
  text-align: center;
  color: #6c757d;
  max-width: 300px;
  padding: 2rem;
}

.loading-content h3 {
  margin: 0 0 1rem 0;
  font-size: 1.5rem;
}

.loading-content p {
  margin: 0;
  line-height: 1.5;
}

/* Override some SurveyJS Creator styles */
:deep(.svc-creator) {
  height: 100% !important;
  width: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
}

:deep(.svc-creator__content) {
  height: calc(100% - 60px) !important;
  width: 100% !important;
}

:deep(.sv-action-bar) {
  background: #fff !important;
  border-bottom: 1px solid #e9ecef !important;
}

:deep(.svc-tab-designer .svc-tabbed-menu-wrapper) {
  background: #f8f9fa !important;
}

:deep(.svc-tab-designer) {
  width: 100% !important;
}

:deep(.svc-creator__area) {
  width: 100% !important;
}

:deep(.sv-action--pressed) {
  background: #667eea !important;
  color: white !important;
}

:deep(.sv-action:hover) {
  background: rgba(102, 126, 234, 0.1) !important;
}
</style>
