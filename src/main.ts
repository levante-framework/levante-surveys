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

// SurveyJS styles and Vue plugin
import 'survey-core/survey-core.min.css'
import 'survey-creator-core/survey-creator-core.min.css'
import { surveyCreatorPlugin } from 'survey-creator-vue'

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
app.component('Button', Button)
app.component('Card', Card)
app.component('Toast', Toast)
app.component('ConfirmDialog', ConfirmDialog)
app.component('ProgressSpinner', ProgressSpinner)
app.component('Divider', Divider)

// Register SurveyJS Creator plugin
app.use(surveyCreatorPlugin)

// Use plugins
app.use(pinia)
app.use(router)

// Mount app
app.mount('#app')

console.log('🔬 Levante Survey Manager initialized')
