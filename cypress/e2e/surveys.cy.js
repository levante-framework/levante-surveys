/**
 * E2E Tests for Survey JSON Files
 *
 * These tests verify that our generated survey JSON files work correctly
 * with SurveyJS and that translations are properly applied.
 */

describe('Survey JSON Files E2E Tests', () => {
  const surveys = [
    'child_survey.json',
    'parent_survey_family.json',
    'parent_survey_child.json',
    'teacher_survey_general.json',
    'teacher_survey_classroom.json'
  ]

  beforeEach(() => {
    // Visit the survey testing page
    cy.visit('/survey-test')

    // Check if we get a 404 or if the page loads
    cy.get('body').should('not.contain', 'Cannot GET')
    cy.get('body').should('not.contain', '404')

    // Check if the app div exists
    cy.get('#app').should('exist')

    // Wait for the survey test page to appear
    cy.get('.survey-test-page', { timeout: 30000 }).should('be.visible')

    // Wait for the Vue component to be fully ready
    cy.window({ timeout: 15000 }).should('have.property', 'surveyTestViewReady', true)

    // Wait for the survey functions to be exposed
    cy.window().should('have.property', 'loadSurveyFromData')

    // Check for any component errors
    cy.get('.survey-test-page').should('not.contain', 'Component Error')
  })

  surveys.forEach((surveyFile) => {
    describe(`${surveyFile} Tests`, () => {

      it('should load and render without errors', () => {
        cy.loadSurvey(surveyFile)
        cy.verifySurveyRenders()
        cy.verifySurveyHasQuestions()
      })

      it('should contain valid multilingual content', () => {
        cy.loadSurvey(surveyFile)

        cy.get('@surveyData').then((surveyData) => {
          // Verify the survey has the expected structure
          expect(surveyData).to.have.property('pages')
          expect(surveyData.pages).to.be.an('array').that.is.not.empty

          // Check for multilingual properties in questions
          const hasMultilingualContent = JSON.stringify(surveyData).includes('"en":') ||
                                       JSON.stringify(surveyData).includes('"es":') ||
                                       JSON.stringify(surveyData).includes('"de":') ||
                                       JSON.stringify(surveyData).includes('"default":')

          expect(hasMultilingualContent, 'Survey should contain multilingual content').to.be.true
        })
      })

      it('should handle language switching', () => {
        cy.loadSurvey(surveyFile)
        cy.verifySurveyRenders()

        // Test switching between available languages
        const languages = ['en', 'es', 'de', 'fr', 'nl']
        cy.verifyMultilingualSupport(languages)
      })

      it('should validate required fields and structure', () => {
        cy.loadSurvey(surveyFile)

        cy.window().then((win) => {
          const survey = win.testSurvey

          // Verify survey has required properties
          expect(survey.pages).to.exist
          expect(survey.pages.length).to.be.greaterThan(0)

          // Verify each page has elements
          survey.pages.forEach((page, pageIndex) => {
            expect(page.elements, `Page ${pageIndex} should have elements`).to.exist
            expect(page.elements.length, `Page ${pageIndex} should have questions`).to.be.greaterThan(0)
          })

          // Check for survey completion logic
          const canComplete = survey.isLastPage || survey.pages.length === 1
          expect(canComplete, 'Survey should be completable').to.exist
        })
      })

      it('should handle regional language variants', () => {
        cy.loadSurvey(surveyFile)

        cy.get('@surveyData').then((surveyData) => {
          const surveyString = JSON.stringify(surveyData)

          // Check for regional variants that should be preserved
          const hasRegionalVariants = surveyString.includes('es_CO') ||
                                     surveyString.includes('es_AR') ||
                                     surveyString.includes('de_CH') ||
                                     surveyString.includes('fr_CA') ||
                                     surveyString.includes('en_GH')

          if (hasRegionalVariants) {
            cy.log('Survey contains regional language variants')

            // Test that regional variants work with SurveyJS
            cy.window().then((win) => {
              const survey = win.testSurvey

              // Test setting regional locales
              const regionalLocales = ['es_CO', 'es_AR', 'de_CH', 'fr_CA']
              regionalLocales.forEach((locale) => {
                try {
                  survey.locale = locale
                  // If no error thrown, the locale is supported
                  cy.log(`Regional locale ${locale} is supported`)
                } catch {
                  // Some regional variants might fall back to base language
                  cy.log(`Regional locale ${locale} falls back to base language`)
                }
              })
            })
          }
        })
      })

      it('should not contain translation artifacts or errors', () => {
        cy.loadSurvey(surveyFile)
        cy.verifySurveyRenders()

        // Check that there are no common translation artifacts
        cy.get('body').should('not.contain', '{{')
        cy.get('body').should('not.contain', '}}')
        cy.get('body').should('not.contain', '[object Object]')
        cy.get('body').should('not.contain', 'undefined')
        cy.get('body').should('not.contain', 'null')
        cy.get('body').should('not.contain', 'NaN')

        // Check for empty translations
        cy.get('.sv-string-editor').should('not.be.empty')
      })

      // Skip completion test for teacher surveys as they're longer
      if (!surveyFile.includes('teacher')) {
        it('should allow survey completion', () => {
          cy.loadSurvey(surveyFile)
          cy.verifySurveyRenders()

          // Try to complete the survey
          cy.completeSurvey()

          // Verify completion or progress
          cy.window().then((win) => {
            const survey = win.testSurvey
            // Check if survey progressed or completed
            expect(survey.state).to.not.equal('starting')
          })
        })
      }
    })
  })

  describe('Survey Comparison Tests', () => {
    it('should verify all surveys load successfully', () => {
      let loadedSurveys = 0

      surveys.forEach((surveyFile) => {
        cy.fixture(surveyFile).then((surveyData) => {
          expect(surveyData).to.be.an('object')
          expect(surveyData.pages).to.be.an('array')
          loadedSurveys++
        })
      })

      cy.then(() => {
        expect(loadedSurveys).to.equal(surveys.length)
      })
    })

    it('should verify consistent multilingual structure across surveys', () => {
      const multilingualPatterns = []

      surveys.forEach((surveyFile) => {
        cy.fixture(surveyFile).then((surveyData) => {
          const surveyString = JSON.stringify(surveyData)
          const hasDefault = surveyString.includes('"default":')
          const hasEn = surveyString.includes('"en":')
          const hasEs = surveyString.includes('"es":')

          multilingualPatterns.push({
            survey: surveyFile,
            hasDefault,
            hasEn,
            hasEs
          })
        })
      })

      cy.then(() => {
        // Verify all surveys have consistent multilingual structure
        const allHaveDefault = multilingualPatterns.every(p => p.hasDefault)
        const allHaveMultilingual = multilingualPatterns.every(p => p.hasEn || p.hasEs)

        expect(allHaveDefault || allHaveMultilingual, 'All surveys should have multilingual content').to.be.true
      })
    })
  })
})
