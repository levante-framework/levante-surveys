import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SurveyModel } from 'survey-core'
import type { SurveyFileKey } from '@/constants/bucket'

// Survey metadata for UI display
interface SurveyInfo {
  key: SurveyFileKey
  title: string
  description: string
  fileName: string
  icon: string
}

// Survey response from GCS
interface SurveyResponse {
  data: any
  metadata: {
    size: number
    lastModified?: string
    contentType?: string
  }
}

export const useSurveyStore = defineStore('survey', () => {
  // State - using plain object instead of Map for better persistence
  const surveys = ref<Record<SurveyFileKey, any>>({})
  const currentSurvey = ref<any>(null)
  const currentSurveyKey = ref<SurveyFileKey | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const surveyModel = ref<SurveyModel | null>(null)
  const creatorSurvey = ref<any>(null)
  const isCreatorMode = ref(false)

  // Getters
  const surveyInfo = computed((): SurveyInfo[] => [
    {
      key: 'PARENT_FAMILY',
      title: 'Family Survey',
      description: 'Caregiver survey focusing on family dynamics and home environment',
      fileName: 'parent_survey_family.json',
      icon: '👨‍👩‍👧‍👦'
    },
    {
      key: 'PARENT_CHILD',
      title: 'Child Survey',
      description: 'Caregiver survey about specific child development and behavior',
      fileName: 'parent_survey_child.json',
      icon: '👶'
    },
    {
      key: 'CHILD',
      title: 'Student Survey',
      description: 'Direct assessment survey for children and students',
      fileName: 'child_survey.json',
      icon: '🎓'
    },
    {
      key: 'TEACHER_GENERAL',
      title: 'Teacher General',
      description: 'General teacher assessment and classroom observations',
      fileName: 'teacher_survey_general.json',
      icon: '👨‍🏫'
    },
    {
      key: 'TEACHER_CLASSROOM',
      title: 'Teacher Classroom',
      description: 'Specific classroom environment and teaching practice assessment',
      fileName: 'teacher_survey_classroom.json',
      icon: '🏫'
    }
  ])

  const surveyList = computed(() => {
    return surveyInfo.value.map(info => ({
      ...info,
      isLoaded: !!surveys.value[info.key],
      data: surveys.value[info.key] || null
    }))
  })

  const currentSurveyInfo = computed(() => {
    if (!currentSurveyKey.value) return null
    return surveyInfo.value.find(info => info.key === currentSurveyKey.value) || null
  })

  // Actions
  const loadSurvey = async (/* surveyKey: SurveyFileKey */): Promise<any> => {
    isLoading.value = true
    error.value = null

    try {
      // Implementation will be handled by the component using survey helpers
      // This is a placeholder for the store action
      throw new Error('Use loadSurveyFromBucket helper function directly')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error occurred'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const setSurvey = (surveyKey: SurveyFileKey, surveyData: any) => {
    surveys.value[surveyKey] = surveyData
  }

  const setCurrentSurvey = (surveyKey: SurveyFileKey | null, surveyData: any = null) => {
    currentSurveyKey.value = surveyKey
    currentSurvey.value = surveyData
  }

  const clearCurrentSurvey = () => {
    currentSurveyKey.value = null
    currentSurvey.value = null
    surveyModel.value = null
  }

  const setSurveyModel = (model: SurveyModel | null) => {
    surveyModel.value = model
  }

  const setCreatorSurvey = (survey: any) => {
    creatorSurvey.value = survey
  }

  const toggleCreatorMode = () => {
    isCreatorMode.value = !isCreatorMode.value
  }

  const setError = (errorMessage: string | null) => {
    error.value = errorMessage
  }

  const clearError = () => {
    error.value = null
  }

  const setLoading = (loading: boolean) => {
    isLoading.value = loading
  }

  return {
    // State
    surveys,
    currentSurvey,
    currentSurveyKey,
    isLoading,
    error,
    surveyModel,
    creatorSurvey,
    isCreatorMode,

    // Getters
    surveyInfo,
    surveyList,
    currentSurveyInfo,

    // Actions
    loadSurvey,
    setSurvey,
    setCurrentSurvey,
    clearCurrentSurvey,
    setSurveyModel,
    setCreatorSurvey,
    toggleCreatorMode,
    setError,
    clearError,
    setLoading
  }
}, {
  persist: {
    storage: sessionStorage,
    paths: ['surveys', 'currentSurveyKey']
  }
})

export type { SurveyInfo, SurveyResponse }
