import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

// Vue Router
import router from './router'

// Main App
import App from './App.vue'

// PrimeVue
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'

// PrimeVue Components
import Button from 'primevue/button'
import Card from 'primevue/card'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import ProgressSpinner from 'primevue/progressspinner'
import Divider from 'primevue/divider'

// PrimeIcons
import 'primeicons/primeicons.css'

// SurveyJS styles and Vue plugin (v2 default theme)
import 'survey-core/survey-core.min.css'
import 'survey-creator-core/survey-creator-core.min.css'
// Ensure Survey and Creator theme registries are loaded so pickers have options
import 'survey-core/themes/index'
import 'survey-creator-core/themes/index'
import { surveyCreatorPlugin } from 'survey-creator-vue'
import { settings as SurveySettings, slk } from 'survey-core'
import { settings as CreatorSettings } from 'survey-creator-core'
// SurveyJS widgets
import * as SurveyCore from 'survey-core'
import * as widgets from 'surveyjs-widgets'
import 'nouislider/dist/nouislider.css'

// Apply SurveyJS license globally as early as possible
try {
  const licenseKey = import.meta.env.VITE_SURVEYJS_LICENSE_KEY
  if (licenseKey && typeof licenseKey === 'string') {
    // Preferred API in SurveyJS >= 1.9.101
    slk(licenseKey)
    // Back-compat assignment
    // @ts-ignore
    SurveySettings.license = licenseKey
    // Also set for Creator core explicitly (defensive)
    // @ts-ignore
    CreatorSettings.license = licenseKey
    console.log('✅ SurveyJS license key applied (global)')
  } else {
    console.warn('⚠️ VITE_SURVEYJS_LICENSE_KEY is not set')
  }
} catch (e) {
  console.warn('⚠️ Failed to apply SurveyJS license key globally:', (e as Error).message)
}

// Create Vue app
const app = createApp(App)

// Configure Pinia with persistence
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

// Configure PrimeVue with Aura theme
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      prefix: 'p',
      darkModeSelector: false,
      cssLayer: false
    }
  }
})

// PrimeVue Services
app.use(ToastService)
app.use(ConfirmationService)

// Register PrimeVue Components
app.component('PvButton', Button)
app.component('PvCard', Card)
app.component('PvToast', Toast)
app.component('PvConfirmDialog', ConfirmDialog)
app.component('PvProgressSpinner', ProgressSpinner)
app.component('PvDivider', Divider)

// Register SurveyJS Creator plugin
app.use(surveyCreatorPlugin)

// Initialize a subset of SurveyJS widgets for demo parity
try {
  widgets.select2?.(SurveyCore as any)
  widgets.inputmask?.(SurveyCore as any)
  widgets.signaturepad?.(SurveyCore as any)
  widgets.nouislider?.(SurveyCore as any)
  widgets.select2tagbox?.(SurveyCore as any)
  widgets.sortablejs?.(SurveyCore as any)
  // Skip editors that add heavy deps unless needed (ckeditor, prettycheckboxes, etc.)
  console.log('✅ SurveyJS widgets initialized')
} catch (e) {
  console.warn('⚠️ Failed to init SurveyJS widgets:', (e as Error).message)
}

// Use plugins
app.use(pinia)
app.use(router)

// Mount app
app.mount('#app')

console.log('🔬 Levante Survey Manager initialized')

// Apply Levante custom CSS variables at root to affect SurveyJS v2 default theme
document.documentElement.style.setProperty('--sjs-font-family', '"Inter", system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif')
document.documentElement.style.setProperty('--sjs-corner-radius', '8px')
document.documentElement.style.setProperty('--sjs-primary-backcolor', '#5C6AC4')
document.documentElement.style.setProperty('--sjs-primary-forecolor', '#ffffff')
