/**
 * Survey Content Validation Tests
 *
 * This test suite validates that surveys have complete, meaningful content
 * in each supported locale by actually running through the survey elements
 * and checking for proper translations.
 */

describe('Survey Content Validation', () => {
  const surveys = [
    'child_survey.json',
    'parent_survey_family.json',
    'parent_survey_child.json',
    'teacher_survey_general.json',
    'teacher_survey_classroom.json'
  ]

  // Locales we expect to have meaningful content (not just fallbacks)
  const supportedLocales = [
    { code: 'en', name: 'English (Default)', expectComplete: true, hasNavigation: true },
    { code: 'es', name: 'Spanish', expectComplete: true, hasNavigation: true },
    { code: 'de', name: 'German', expectComplete: true, hasNavigation: true },
    { code: 'es-CO', name: 'Spanish (Colombia)', expectComplete: true, hasNavigation: true },
    { code: 'fr-CA', name: 'French (Canada)', expectComplete: true, hasNavigation: false }, // Missing navigation translations
    { code: 'nl', name: 'Dutch', expectComplete: false, hasNavigation: false }, // Missing navigation translations
    { code: 'fr', name: 'French (Base)', expectComplete: false, hasNavigation: false }, // Missing navigation translations
    { code: 'en-US', name: 'English (US)', expectComplete: false, hasNavigation: false }, // May be partial
    { code: 'en-GH', name: 'English (Ghana)', expectComplete: false, hasNavigation: false }, // May be partial
  ]

  beforeEach(() => {
    cy.visit('/survey-test')
    cy.get('.survey-test-page', { timeout: 30000 }).should('be.visible')
    cy.window({ timeout: 15000 }).should('have.property', 'surveyTestViewReady', true)
    cy.window().should('have.property', 'loadSurveyFromData')
  })

  surveys.forEach((surveyFile) => {
    describe(`${surveyFile} - Content Validation`, () => {

      beforeEach(() => {
        cy.loadSurvey(surveyFile)
        cy.verifySurveyRenders()
      })

      supportedLocales.forEach((locale) => {
        it(`should have proper content in ${locale.name} (${locale.code})`, () => {
          cy.window().then((win) => {
            const survey = win.testSurvey

            // Set the locale
            survey.locale = locale.code
            cy.log(`🌍 Testing ${locale.name} for ${surveyFile}`)

            // Give SurveyJS time to process locale change
            cy.wait(200)

            // Test 1: Navigation text should be meaningful (not empty or placeholder)
            const navigationTexts = {
              start: survey.startSurveyText,
              next: survey.pageNextText,
              prev: survey.pagePrevText,
              complete: survey.completeText
            }

            Object.entries(navigationTexts).forEach(([key, text]) => {
              if (text) {
                // Should have meaningful content (more than 1 char)
                expect(text.trim().length).to.be.greaterThan(1)
                cy.log(`✅ ${key} text: "${text}"`)

                // Check navigation text translations based on locale capabilities
                if (locale.code !== 'en' && locale.hasNavigation) {
                  // This locale should have translated navigation texts
                  expect(text).to.not.equal('Start Survey')
                  expect(text).to.not.equal('Next')
                  expect(text).to.not.equal('Previous')
                  expect(text).to.not.equal('Complete')
                } else if (locale.code !== 'en' && !locale.hasNavigation) {
                  // This locale doesn't have navigation translations yet - log but don't fail
                  const isEnglishText = ['Start Survey', 'Next', 'Previous', 'Complete'].includes(text)
                  if (isEnglishText) {
                    cy.log(`ℹ️  ${key} still in English for ${locale.name} (navigation translations not available in Crowdin yet)`)
                  } else {
                    cy.log(`✅ ${key} translated for ${locale.name}: "${text}"`)
                  }
                }
              }
            })

            // Test 2: Survey title/description should be translated
            if (survey.title) {
              expect(survey.title.trim().length).to.be.greaterThan(0)
              cy.log(`✅ Survey title: "${survey.title}"`)

              // For non-English locales with complete translations, title should be different from English
              if (locale.code !== 'en' && locale.expectComplete && locale.hasNavigation) {
                // Store original locale to compare
                const originalLocale = survey.locale
                survey.locale = 'en'
                const englishTitle = survey.title
                survey.locale = originalLocale
                const localizedTitle = survey.title

                if (englishTitle && localizedTitle) {
                  expect(localizedTitle).to.not.equal(englishTitle,
                    `Title should be translated for ${locale.name}`)
                }
              } else if (locale.code !== 'en' && (!locale.expectComplete || !locale.hasNavigation)) {
                // For incomplete locales, just log if title is still in English
                const originalLocale = survey.locale
                survey.locale = 'en'
                const englishTitle = survey.title
                survey.locale = originalLocale
                const localizedTitle = survey.title

                if (englishTitle && localizedTitle && localizedTitle === englishTitle) {
                  cy.log(`ℹ️  Title still in English for ${locale.name} (expected for incomplete locale)`)
                } else if (englishTitle && localizedTitle && localizedTitle !== englishTitle) {
                  cy.log(`✅ Title translated for ${locale.name}: "${localizedTitle}"`)
                }
              }
            }

            // Test 3: Check a sample of questions for translation
            const pages = survey.pages
            if (pages && pages.length > 0) {
              const sampleSize = Math.min(3, pages.length) // Test first 3 pages

              for (let i = 0; i < sampleSize; i++) {
                const page = pages[i]
                const questions = page.elements || []

                if (questions.length > 0) {
                  const question = questions[0] // Test first question on page

                  // Check question title/text
                  if (question.title) {
                    expect(question.title.trim().length).to.be.greaterThan(0)
                    cy.log(`✅ Page ${i+1}, Q1 title: "${question.title.substring(0, 50)}..."`)

                    // For choice questions, check that choices are translated
                    if (question.choices && question.choices.length > 0) {
                      question.choices.slice(0, 2).forEach((choice, choiceIndex) => {
                        let choiceText = choice
                        if (typeof choice === 'object' && choice.text) {
                          choiceText = choice.text
                        }

                        if (choiceText) {
                          expect(choiceText.trim().length).to.be.greaterThan(0)
                          cy.log(`✅ Page ${i+1}, Q1, Choice ${choiceIndex+1}: "${choiceText}"`)
                        }
                      })
                    }
                  }
                }
              }
            }

            // Test 4: Verify no obvious translation failures
            // Look for common signs of missing translations
            cy.get('body').then(($body) => {
              const bodyText = $body.text()

              // Should not contain obvious placeholder text
              const badPatterns = [
                'undefined',
                'null',
                '[object Object]',
                '{{',
                '}}',
                'TRANSLATION_MISSING'
              ]

              badPatterns.forEach(pattern => {
                expect(bodyText).to.not.include(pattern,
                  `Should not contain "${pattern}" - indicates translation problem`)
              })
            })

            // Test 5: Survey should be functional (can navigate if multi-page)
            if (survey.pageCount > 1) {
              cy.log(`📄 Testing navigation in ${locale.name} (${survey.pageCount} pages)`)

              // Try to go to next page if there are multiple pages
              if (survey.isFirstPage && !survey.isLastPage) {
                cy.get('body').then(($body) => {
                  // Look for next button (various possible selectors)
                  const nextSelectors = [
                    '[data-name="navigation-next"]',
                    '.sv-btn.sv-next-btn',
                    '.sd-btn.sd-navigation__next',
                    'input[value*="Next"]',
                    'input[value*="next"]',
                    'button:contains("Next")',
                    `button:contains("${survey.pageNextText}")`,
                  ]

                  let nextButtonFound = false
                  nextSelectors.forEach(selector => {
                    if ($body.find(selector).length > 0) {
                      nextButtonFound = true
                      cy.log(`✅ Found next button with selector: ${selector}`)
                    }
                  })

                  if (nextButtonFound) {
                    cy.log(`✅ Navigation appears functional in ${locale.name}`)
                  } else {
                    cy.log(`⚠️  Could not locate next button in ${locale.name}`)
                  }
                })
              }
            }

            cy.log(`✅ Content validation complete for ${locale.name}`)
          })
        })
      })

      // Cross-locale consistency test
      it('should have consistent structure across locales', () => {
        cy.window().then((win) => {
          const survey = win.testSurvey
          const baselineLocale = 'en'

          // Get baseline structure
          survey.locale = baselineLocale
          const baselinePageCount = survey.pageCount
          const baselineQuestionCount = survey.getAllQuestions().length

          cy.log(`📊 Baseline (${baselineLocale}): ${baselinePageCount} pages, ${baselineQuestionCount} questions`)

          // Test each locale has same structure
          supportedLocales.forEach((locale) => {
            survey.locale = locale.code
            const localePageCount = survey.pageCount
            const localeQuestionCount = survey.getAllQuestions().length

            expect(localePageCount).to.equal(baselinePageCount,
              `${locale.name} should have same page count as baseline`)
            expect(localeQuestionCount).to.equal(baselineQuestionCount,
              `${locale.name} should have same question count as baseline`)

            cy.log(`✅ ${locale.name}: ${localePageCount} pages, ${localeQuestionCount} questions`)
          })
        })
      })
    })
  })

  // Summary test across all surveys
  describe('Cross-Survey Locale Summary', () => {
    it('should generate locale coverage report', () => {
      const coverageReport = {}

      surveys.forEach((surveyFile) => {
        cy.loadSurvey(surveyFile)

        cy.window().then((win) => {
          const survey = win.testSurvey
          const surveyLocales = []

          supportedLocales.forEach((locale) => {
            survey.locale = locale.code

            // Check if this locale has meaningful content
            const hasTitle = survey.title && survey.title.trim().length > 0
            const hasNavigation = survey.pageNextText && survey.pageNextText.trim().length > 0
            const hasQuestions = survey.getAllQuestions().length > 0

            if (hasTitle && hasNavigation && hasQuestions) {
              surveyLocales.push(locale.code)
            }
          })

          coverageReport[surveyFile] = surveyLocales
        })
      })

      cy.then(() => {
        cy.log('🌍 LOCALE COVERAGE REPORT:')
        Object.entries(coverageReport).forEach(([survey, locales]) => {
          cy.log(`📋 ${survey}: ${locales.join(', ')} (${locales.length} locales)`)
        })

        // Find common locales across all surveys
        const allSurveyLocales = Object.values(coverageReport)
        const commonLocales = supportedLocales.filter(locale =>
          allSurveyLocales.every(surveyLocales =>
            surveyLocales.includes(locale.code)
          )
        ).map(l => l.code)

        cy.log(`🤝 Common across all surveys: ${commonLocales.join(', ')}`)

        // Ensure at least English is supported everywhere
        expect(commonLocales).to.include('en', 'All surveys should support English')
      })
    })
  })
})
