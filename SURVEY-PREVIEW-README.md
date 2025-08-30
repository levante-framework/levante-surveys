# 🔬 Levante Survey Preview Tool

A beautiful, modern web application for previewing and testing Levante survey JSON files across multiple environments and languages.

## 🌐 Live Application

**Production URL**: https://levante-survey-preview.vercel.app

## ✨ Features

### 🎯 Multi-Environment Support
- **Development**: `levante-assets-dev/surveys/` - Latest development versions
- **Legacy Production**: `levante-dashboard-prod/` - Current production surveys (root level)
- **Production**: `levante-assets-prod/surveys/` - Future production environment (coming soon)

### 🗣️ Dynamic Language Detection
- Automatically detects all available languages in each survey
- Prioritizes regional language codes (e.g., `es-CO`, `de-CH`) over base codes (e.g., `es`, `de`)
- Supports all Levante language variants including:
  - English variants: `en-US`, `en-GH`
  - Spanish variants: `es-CO`, `es-AR`
  - German variants: `de-CH`
  - French variants: `fr-CA`
  - And more...

### 📱 Modern UI/UX
- **Glassmorphism design** with gradient backgrounds
- **Full-width survey preview** for optimal viewing
- **Compact sidebar** with organized controls
- **Real-time environment indicators** with color-coded badges
- **Responsive layout** that works on all screen sizes

### 🔄 Smart Workflow
1. **Select Environment** - Choose dev, legacy prod, or future prod
2. **Pick Survey** - Choose from 5 available surveys
3. **Auto-populate Languages** - Languages are detected from the actual survey data
4. **Preview & Test** - Full SurveyJS rendering with navigation

## 🏗️ Architecture

### Frontend Stack
- **Vue 3** with Composition API
- **SurveyJS** for survey rendering
- **Vite** for build tooling
- **Modern CSS** with custom styling

### Deployment
- **Vercel** hosting with automatic deployments
- **Custom domain alias** for clean URLs
- **Build optimization** with code splitting

### Survey Sources
```
Development:     https://storage.googleapis.com/levante-assets-dev/surveys/
Legacy Prod:     https://storage.googleapis.com/levante-dashboard-prod/
Future Prod:     https://storage.googleapis.com/levante-assets-prod/surveys/
```

## 🚀 Development

### Prerequisites
- Node.js 20.19.0+ or 22.12.0+
- npm

### Setup
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build-only

# Build and deploy to Vercel
npm run build-deploy
```

### Key Files
- `src/views/SurveyTestView.vue` - Main preview component
- `src/constants/languages.js` - Language configuration
- `vercel.json` - Deployment configuration
- `scripts/compare-translations.cjs` - Translation analysis tool

## 📊 Available Surveys

1. **Child Survey** - Student self-assessment questionnaire
2. **Parent Survey (Family)** - Family background and context
3. **Parent Survey (Child)** - Parent assessment of child
4. **Teacher Survey (General)** - General teacher questionnaire
5. **Teacher Survey (Classroom)** - Classroom-specific assessment

## 🔧 Utility Scripts

### Translation Comparison
```bash
# Compare es vs es-CO translations across all survey elements
node scripts/compare-translations.cjs
```

This script analyzes:
- Identical translations between language variants
- Different translations that may need review
- Missing translations in either variant
- Coverage across dev and prod environments

## 🎨 UI Components

### Environment Badges
- **Development**: Blue badge (`levante-assets-dev`)
- **Legacy Production**: Orange badge (`levante-dashboard-prod`)
- **Future Production**: Purple badge (`levante-assets-prod`)

### Language Selector
- Dynamically populated from survey data
- Regional codes prioritized over base language codes
- Disabled until survey is selected
- Shows readable language names with regions

### Survey Preview
- Full-width content area for optimal survey viewing
- SurveyJS integration with complete functionality
- Real-time language switching
- Navigation and completion tracking

## 🔄 Deployment Workflow

### Automatic Deployment
```bash
npm run build-deploy
```

This command:
1. Builds the optimized production bundle
2. Deploys to Vercel
3. Automatically creates a clean alias URL

### Manual Steps
```bash
# Build only
npm run build-only

# Deploy to Vercel
vercel --prod

# Create alias (replace with actual deployment URL)
vercel alias https://levante-survey-preview-[hash].vercel.app levante-survey-preview.vercel.app
```

## 🐛 Troubleshooting

### Common Issues

**Survey not loading:**
- Check browser console for network errors
- Verify the survey exists in the selected environment
- Try refreshing with the "Refresh Survey" button

**Languages not showing:**
- Ensure the survey has been selected
- Check that the survey JSON contains localized content
- Verify the survey structure includes translation objects

**Old survey version:**
- Browser caching may show old versions
- Hard refresh (Ctrl+F5 or Cmd+Shift+R)
- Check if you're looking at the correct environment

### Cache Issues
Google Cloud Storage may cache survey files. The app includes cache-busting techniques, but curl commands may need explicit cache headers:

```bash
curl -s -H "Cache-Control: no-cache" "https://storage.googleapis.com/levante-dashboard-prod/child_survey.json?$(date +%s)"
```

## 📈 Performance

### Optimizations
- **Code splitting** for faster initial loads
- **Lazy loading** of survey components
- **Efficient re-rendering** with Vue's reactivity
- **Optimized assets** with Vite bundling

### Bundle Analysis
- Main bundle: ~3MB (includes SurveyJS library)
- CSS: ~7.4KB (custom styling)
- Assets: Cached and optimized

## 🔮 Future Enhancements

### Planned Features
- **Survey comparison** between environments
- **Translation completeness** dashboard
- **Export functionality** for survey responses
- **Advanced filtering** by language availability
- **Survey metadata** display (creation date, version, etc.)

### Technical Improvements
- **Progressive Web App** (PWA) capabilities
- **Offline survey** preview
- **Advanced caching** strategies
- **Performance monitoring** integration

## 🤝 Contributing

### Development Guidelines
1. Use Vue 3 Composition API patterns
2. Follow existing CSS naming conventions
3. Test across all supported browsers
4. Ensure mobile responsiveness
5. Update this README for new features

### Code Style
- **ESLint** configuration for consistency
- **Prettier** for code formatting
- **Vue SFC** best practices
- **Semantic commit** messages

## 📝 License

This project is part of the Levante survey system. See the main repository README for licensing information.

---

**Built with ❤️ for the Levante education research project**
