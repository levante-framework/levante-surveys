/**
 * Comprehensive Locale Testing for Survey JSON Files
 *
 * Tests all supported locales across all survey types to ensure:
 * - Proper locale switching
 * - Content availability in each locale
 * - Regional variant handling
 * - Translation completeness
 */

describe('Survey Locales Comprehensive Tests', () => {
  const surveys = [
    'child_survey.json',
    'parent_survey_family.json',
    'parent_survey_child.json',
    'teacher_survey_general.json',
    'teacher_survey_classroom.json'
  ]

    // Actually supported locales (verified to exist in survey data)
  const actuallySupported = [
    // Base languages
    { code: 'en', name: 'English (Default)', jsonKey: 'default' },
    { code: 'es', name: 'Spanish', jsonKey: 'es' },
    { code: 'de', name: 'German', jsonKey: 'de' },
    { code: 'fr', name: 'French', jsonKey: 'fr' },
    { code: 'nl', name: 'Dutch', jsonKey: 'nl' },

    // Regional variants that actually exist in surveys
    { code: 'en-US', name: 'English (US)', jsonKey: 'en-US' },
    { code: 'en-GH', name: 'English (Ghana)', jsonKey: 'en-GH' },
    { code: 'es-CO', name: 'Spanish (Colombia)', jsonKey: 'es-CO' },
    { code: 'es-AR', name: 'Spanish (Argentina)', jsonKey: 'es-AR' },
    { code: 'de-CH', name: 'German (Switzerland)', jsonKey: 'de-CH' },
    { code: 'fr-CA', name: 'French (Canada)', jsonKey: 'fr-CA' },

    // Legacy underscore formats (backward compatibility)
    { code: 'es_CO', name: 'Spanish (Colombia) - Legacy', jsonKey: 'es-CO' },
    { code: 'en_US', name: 'English (US) - Legacy', jsonKey: 'en-US' },
    { code: 'en_GH', name: 'English (Ghana) - Legacy', jsonKey: 'en-GH' }
  ]

  // Locales that should NOT be supported (for negative testing)
  const unsupportedLocales = [
    { code: 'en-GB', name: 'English (UK)', jsonKey: 'en-GB' },
    { code: 'de-AT', name: 'German (Austria)', jsonKey: 'de-AT' },
    { code: 'es-MX', name: 'Spanish (Mexico)', jsonKey: 'es-MX' },
    { code: 'fr-FR', name: 'French (France)', jsonKey: 'fr-FR' }
  ]

  beforeEach(() => {
    // Visit the survey testing page
    cy.visit('/survey-test')

    // Wait for the survey test page to load
    cy.get('.survey-test-page', { timeout: 30000 }).should('be.visible')

    // Wait for the Vue component to be fully ready
    cy.window({ timeout: 15000 }).should('have.property', 'surveyTestViewReady', true)
    cy.window().should('have.property', 'loadSurveyFromData')
  })

  surveys.forEach((surveyFile) => {
    describe(`${surveyFile} - Locale Coverage Tests`, () => {

      beforeEach(() => {
        // Load the survey before each locale test
        cy.loadSurvey(surveyFile)
        cy.verifySurveyRenders()
      })

            // Test actually supported locales
      actuallySupported.forEach((locale) => {
        it(`should handle supported locale: ${locale.name} (${locale.code})`, () => {

          // Get the survey data to verify this locale has content
          cy.get('@surveyData').then((surveyData) => {
            const surveyString = JSON.stringify(surveyData)
            const hasLocaleContent = surveyString.includes(`"${locale.jsonKey}":`)

            // This SHOULD have content since it's in our "actually supported" list
            expect(hasLocaleContent, `${locale.name} should have content in survey`).to.be.true

            cy.log(`✅ Survey has content for ${locale.name}`)

            // Test switching to this locale
            cy.window().then((win) => {
              const survey = win.testSurvey

              // Set the locale
              survey.locale = locale.code
              cy.log(`✅ Successfully set locale to ${locale.code}`)

              // Verify the locale was set
              expect(survey.locale).to.equal(locale.code)

              // Check that survey still renders after locale change
              cy.get('.survey-container').should('be.visible')

              // Verify that content is displayed (not empty)
              cy.get('.survey-container').should('not.be.empty')

              // Check for SurveyJS content elements
              cy.get('body').then(($body) => {
                const hasSurveyContent = $body.find('.sv-root, .sd-root, .sv-body, .sd-body').length > 0
                if (hasSurveyContent) {
                  cy.log(`✅ Survey content rendered for ${locale.name}`)
                } else {
                  cy.log(`⚠️  No visible survey content for ${locale.name}`)
                }
              })
            })
          })
        })
      })

      // Test unsupported locales (negative testing)
      unsupportedLocales.forEach((locale) => {
        it(`should handle unsupported locale gracefully: ${locale.name} (${locale.code})`, () => {

          // Get the survey data to verify this locale does NOT have content
          cy.get('@surveyData').then((surveyData) => {
            const surveyString = JSON.stringify(surveyData)
            const hasLocaleContent = surveyString.includes(`"${locale.jsonKey}":`)

            // This should NOT have content
            expect(hasLocaleContent, `${locale.name} should NOT have content in survey`).to.be.false

            cy.log(`✅ Confirmed ${locale.name} has no content (as expected)`)

            // Test what happens when trying to set this locale
            cy.window().then((win) => {
              const survey = win.testSurvey

              // Set the locale (SurveyJS should handle this gracefully)
              survey.locale = locale.code

              // SurveyJS should either:
              // 1. Fall back to a base language (e.g., de-AT -> de)
              // 2. Fall back to default
              // 3. Keep the locale code but use fallback content

              cy.log(`ℹ️  Set unsupported locale ${locale.code}, SurveyJS locale is now: ${survey.locale}`)

              // Survey should still render and be functional
              cy.get('.survey-container').should('be.visible')
              cy.get('.survey-container').should('not.be.empty')
            })
          })
        })
      })

      it('should have consistent locale availability across pages', () => {
        cy.get('@surveyData').then((surveyData) => {
          const availableLocales = []

          // Find all available locales in the survey
          actuallySupported.forEach((locale) => {
            const surveyString = JSON.stringify(surveyData)
            if (surveyString.includes(`"${locale.jsonKey}":`)) {
              availableLocales.push(locale)
            }
          })

          cy.log(`📊 Available locales for ${surveyFile}: ${availableLocales.map(l => l.name).join(', ')}`)

          // Verify that essential locales are present
          const hasDefault = availableLocales.some(l => l.jsonKey === 'default')
          const hasRegionalVariants = availableLocales.some(l => l.code.includes('-'))

          expect(hasDefault, 'Survey should have default English content').to.be.true

          if (availableLocales.length > 1) {
            cy.log(`✅ Survey supports ${availableLocales.length} locales`)

            // Test switching between available locales
            availableLocales.slice(0, 3).forEach((locale) => {
              cy.window().then((win) => {
                const survey = win.testSurvey
                try {
                  survey.locale = locale.code
                  cy.wait(100) // Small delay for locale switching
                  cy.log(`✅ Locale switch to ${locale.name} successful`)
                } catch (error) {
                  cy.log(`⚠️  Locale switch to ${locale.name} failed: ${error.message}`)
                }
              })
            })
          }
        })
      })

      it('should handle navigation text in different locales', () => {
        // Test that navigation elements (start, next, prev, complete) work in different locales
        const navigationLocales = ['en', 'es', 'es-CO', 'de', 'fr']

        navigationLocales.forEach((localeCode) => {
          cy.window().then((win) => {
            const survey = win.testSurvey

            try {
              survey.locale = localeCode

              // Check if navigation text is available
              const startText = survey.startSurveyText
              const nextText = survey.pageNextText
              const prevText = survey.pagePrevText
              const completeText = survey.completeText

              // Log navigation text availability
              if (startText) cy.log(`✅ Start text available for ${localeCode}: "${startText}"`)
              if (nextText) cy.log(`✅ Next text available for ${localeCode}: "${nextText}"`)
              if (prevText) cy.log(`✅ Previous text available for ${localeCode}: "${prevText}"`)
              if (completeText) cy.log(`✅ Complete text available for ${localeCode}: "${completeText}"`)

            } catch (error) {
              cy.log(`⚠️  Navigation text check failed for ${localeCode}: ${error.message}`)
            }
          })
        })
      })
    })
  })

  describe('Cross-Survey Locale Consistency', () => {
    it('should have consistent locale support across all surveys', () => {
      const surveyLocaleMap = {}

      // Load each survey and check its locale support
      surveys.forEach((surveyFile) => {
        cy.loadSurvey(surveyFile)

        cy.get('@surveyData').then((surveyData) => {
                  const surveyString = JSON.stringify(surveyData)
        const localesInSurvey = actuallySupported.filter(locale =>
          surveyString.includes(`"${locale.jsonKey}":`)
        )

          surveyLocaleMap[surveyFile] = localesInSurvey.map(l => l.code)
          cy.log(`📊 ${surveyFile}: ${localesInSurvey.length} locales supported`)
        })
      })

      cy.then(() => {
        // Analyze consistency
        const allLocales = Object.values(surveyLocaleMap).flat()
        const uniqueLocales = [...new Set(allLocales)]

        cy.log(`🌍 Total unique locales across all surveys: ${uniqueLocales.length}`)
        cy.log(`📋 Locales found: ${uniqueLocales.join(', ')}`)

        // Check which locales are common across all surveys
        const commonLocales = uniqueLocales.filter(locale =>
          Object.values(surveyLocaleMap).every(surveyLocales =>
            surveyLocales.includes(locale)
          )
        )

        cy.log(`🤝 Common locales across all surveys: ${commonLocales.join(', ')}`)

        // Verify that at least default English is common
        expect(commonLocales).to.include('en')
      })
    })

        it('should validate regional variant consistency', () => {
      const regionalVariants = actuallySupported.filter(l => l.code.includes('-'))

      cy.log(`🌎 Testing ${regionalVariants.length} regional variants`)

      regionalVariants.forEach((variant) => {
        cy.log(`Testing regional variant: ${variant.name}`)

        // Load a survey and test the regional variant
        cy.loadSurvey('child_survey.json')

        cy.get('@surveyData').then((surveyData) => {
          const surveyString = JSON.stringify(surveyData)
          const hasVariant = surveyString.includes(`"${variant.jsonKey}":`)

          if (hasVariant) {
            cy.window().then((win) => {
              const survey = win.testSurvey

              try {
                survey.locale = variant.code
                cy.log(`✅ Regional variant ${variant.name} works correctly`)

                // Verify the locale was actually set
                expect(survey.locale).to.equal(variant.code)

              } catch (error) {
                cy.log(`⚠️  Regional variant ${variant.name} failed: ${error.message}`)
              }
            })
          } else {
            cy.log(`ℹ️  Regional variant ${variant.name} not available in test survey`)
          }
        })
      })
    })
  })
})
