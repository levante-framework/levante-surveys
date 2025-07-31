# Levante Surveys - Survey Management Application

## Project Overview

This is a TypeScript Vue.js application for managing surveys used in the LEVANTE research platform. The application allows researchers to load, view, edit, and create surveys using the SurveyJS Creator interface.

## What We're Trying to Do

**Primary Goals:**
- Create a standalone survey management application separate from the main levante-dashboard
- Load existing surveys from Google Cloud Storage (GCS) buckets
- Provide a visual interface to edit surveys using SurveyJS Creator
- Allow creation of new surveys from scratch
- Maintain compatibility with the existing survey format used in the main platform

**Target Features:**
- 📋 Survey list view showing all available surveys from GCS
- ✏️ Visual survey editor powered by SurveyJS Creator
- 💾 Save/load surveys to/from Google Cloud Storage
- 🔍 Preview surveys as respondents would see them
- 🎨 Survey theme customization
- 🌐 Multi-language support for surveys

## What We Have Done

### ✅ Project Setup
- [x] Created new Git repository: `levante-framework/levante-surveys`
- [x] Initialized Vue 3 + TypeScript project with Vite
- [x] Installed core dependencies:
  - Vue 3 with Composition API
  - PrimeVue v4 (UI components)
  - Pinia (state management)
  - SurveyJS Creator and Core libraries
  - Axios (HTTP client)
  - TypeScript support

### ✅ Core Architecture
- [x] **Pinia Store** (`src/stores/survey.ts`): Manages survey state, loading status, and current selection
- [x] **Survey Loader** (`src/helpers/surveyLoader.ts`): Handles loading surveys from GCS with error handling
- [x] **Bucket Constants** (`src/constants/bucket.ts`): GCS configuration and survey file mappings
- [x] **Main Dashboard** (`src/views/HomeView.vue`): Split-screen layout with survey list and creator
- [x] **SurveyJS Creator Component** (`src/components/SurveyCreatorComponent.vue`): Wrapper for survey editor

### ✅ Functional Components
- [x] **Survey List**: Displays available surveys with metadata (family, child, teacher surveys)
- [x] **Survey Loading**: Fetches survey JSON from GCS buckets with proper error handling
- [x] **SurveyJS Creator Integration**: Visual survey editor with tabs for design, preview, JSON, etc.
- [x] **Environment Configuration**: Supports dev and production GCS buckets
- [x] **State Persistence**: Pinia store with localStorage persistence

### ✅ Issues Fixed
- [x] **Import/Compilation Errors**: Fixed TypeScript module resolution and CSS imports
- [x] **SurveyJS Creator Initialization**: Corrected event handler names (`onModified` vs incorrect handlers)
- [x] **Naming Conflicts**: Resolved function naming conflicts using dynamic imports
- [x] **State Management**: Fixed plain object usage instead of Map for better persistence
- [x] **UI Components**: Removed default Vue components and implemented custom dashboard

## Current Architecture

```
src/
├── components/
│   └── SurveyCreatorComponent.vue    # SurveyJS Creator wrapper
├── constants/
│   └── bucket.ts                     # GCS bucket configuration
├── helpers/
│   └── surveyLoader.ts               # Survey loading utilities
├── stores/
│   └── survey.ts                     # Pinia store for survey state
├── views/
│   └── HomeView.vue                  # Main dashboard view
├── router/
│   └── index.ts                      # Vue Router configuration
└── main.ts                           # App entry point with plugin setup

surveys/                              # Downloaded survey JSON files
├── parent_survey_family.json         # Caregiver Family Survey (98KB)
├── parent_survey_child.json          # Caregiver Child Survey (260KB)
├── child_survey.json                 # Child Survey (34KB)
├── teacher_survey_general.json       # Teacher General Survey (45KB)
└── teacher_survey_classroom.json     # Teacher Classroom Survey (30KB)

scripts/
└── download-surveys.js               # Downloads surveys from GCS bucket
```

## Environment Configuration

The app automatically detects the environment and uses the appropriate GCS bucket:

- **Development**: `https://storage.googleapis.com/levante-dashboard-dev`
- **Production**: `https://storage.googleapis.com/road-dashboard`

Environment detection is based on the `VITE_FIREBASE_PROJECT` environment variable.

## Available Surveys

Currently configured to load these survey types:
- `PARENT_FAMILY`: Family/caregiver survey
- `PARENT_CHILD`: Child-specific caregiver survey  
- `CHILD`: Direct child survey
- `TEACHER_GENERAL`: General teacher survey
- `TEACHER_CLASSROOM`: Classroom-specific teacher survey

## Development Status

### ✅ Working Features
- Vue 3 + TypeScript application structure
- PrimeVue UI components with Aura theme
- Pinia state management with persistence
- Survey loading from Google Cloud Storage
- SurveyJS Creator integration
- Split-screen dashboard layout
- Environment-based GCS bucket selection

### 🔄 Currently Testing
- Survey loading functionality (resolving naming conflicts)
- SurveyJS Creator event handling
- Survey selection and editing workflow

### ❓ Potential Issues to Monitor
- **CORS Issues**: GCS bucket access might require CORS configuration
- **Large Survey Files**: Loading performance for complex surveys
- **Authentication**: May need authentication for protected surveys
- **Save Functionality**: Currently only loading is implemented

## Next Steps

### 🎯 Immediate Priorities
1. **Test Survey Loading**: Verify GCS connectivity and survey data parsing
2. **Validate SurveyJS Creator**: Ensure editing functionality works correctly
3. **Implement Survey Saving**: Add ability to save modified surveys back to GCS
4. **Error Handling**: Improve user feedback for loading/saving errors

### 🚀 Future Enhancements
1. **Authentication**: Add user authentication for survey management
2. **Version Control**: Track survey versions and changes
3. **Collaboration**: Multi-user editing with conflict resolution
4. **Advanced Features**: 
   - Survey templates
   - Bulk operations
   - Survey analytics integration
   - Export to different formats

### 🐛 Known Issues
- **Debug Logging**: Extensive console logging should be cleaned up for production
- **Type Safety**: Some `any` types should be replaced with proper interfaces
- **Error Boundaries**: Need better error handling and recovery mechanisms

## Running the Application

```bash
# Install dependencies
npm install

# Download current surveys from GCS bucket
npm run download-surveys

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The app will be available at `http://localhost:5173`

## Local Survey Files

The `surveys/` folder contains locally downloaded copies of the survey JSON files from the GCS bucket:

- **parent_survey_family.json** (98KB) - Caregiver Family Survey
- **parent_survey_child.json** (260KB) - Caregiver Child Survey  
- **child_survey.json** (34KB) - Child Survey
- **teacher_survey_general.json** (45KB) - Teacher General Survey
- **teacher_survey_classroom.json** (30KB) - Teacher Classroom Survey

These files are automatically downloaded when you run `npm run download-surveys` and can be used for:
- **Offline Development**: Work without internet connectivity
- **Survey Analysis**: Examine survey structure and question types
- **Backup**: Local copies of current survey configurations
- **Testing**: Load specific survey versions for testing

> **Note**: The surveys folder is commented out in `.gitignore`, so you can choose whether to commit these files to version control.

## Dependencies

### Core Framework
- **Vue 3**: Reactive frontend framework with Composition API
- **TypeScript**: Type safety and better development experience
- **Vite**: Fast build tool and development server

### UI & Styling
- **PrimeVue v4**: Professional Vue component library
- **PrimeIcons**: Icon library for PrimeVue
- **Tailwind CSS**: Utility-first CSS framework

### Survey Management
- **SurveyJS Creator**: Visual survey builder
- **SurveyJS Core**: Survey rendering engine

### State & HTTP
- **Pinia**: Vue state management
- **Axios**: HTTP client for API calls

## Troubleshooting

### Common Issues

1. **"Site not found" or blank page**
   - Ensure Vite dev server is running: `npm run dev`
   - Check console for errors
   - Try hard refresh (Ctrl+F5)

2. **Survey loading errors**
   - Check browser console for CORS or network errors
   - Verify GCS bucket URLs are accessible
   - Check environment variable configuration

3. **SurveyJS Creator not initializing**
   - Verify all SurveyJS dependencies are installed
   - Check for console errors related to event handlers
   - Ensure CSS imports are correct

4. **Import/compilation errors**
   - Clear node_modules and reinstall: `rm -rf node_modules package-lock.json && npm install`
   - Check TypeScript configuration
   - Verify all import paths are correct

## Contact & Support

This project is part of the LEVANTE research platform. For questions or issues:

1. Check the browser console for error messages
2. Review this README for known issues
3. Check the Git commit history for recent changes
4. Create detailed issue reports with reproduction steps

---

**Last Updated**: Created during initial development session
**Status**: Development/Testing Phase
**Next Review**: After survey loading and creator functionality verification