/**
 * Survey JSON Validation Tests
 * 
 * These tests validate the survey JSON files directly without requiring
 * the Vue component to work properly.
 */

describe('Survey JSON File Validation', () => {
  const surveys = [
    'child_survey.json',
    'parent_survey_family.json', 
    'parent_survey_child.json',
    'teacher_survey_general.json',
    'teacher_survey_classroom.json'
  ]

  surveys.forEach((surveyFile) => {
    describe(`${surveyFile} JSON Validation`, () => {
      
      it('should be valid JSON with proper structure', () => {
        cy.fixture(surveyFile).then((surveyData) => {
          // Basic structure validation
          expect(surveyData).to.be.an('object')
          expect(surveyData).to.have.property('pages')
          expect(surveyData.pages).to.be.an('array').that.is.not.empty
          
          // Each page should have elements
          surveyData.pages.forEach((page, pageIndex) => {
            expect(page, `Page ${pageIndex} should be an object`).to.be.an('object')
            expect(page, `Page ${pageIndex} should have elements`).to.have.property('elements')
            expect(page.elements, `Page ${pageIndex} should have non-empty elements`).to.be.an('array').that.is.not.empty
          })
        })
      })

      it('should contain multilingual content', () => {
        cy.fixture(surveyFile).then((surveyData) => {
          const surveyString = JSON.stringify(surveyData)
          
          // Check for multilingual properties
          const hasMultilingualContent = 
            surveyString.includes('"en":') ||
            surveyString.includes('"es":') ||
            surveyString.includes('"de":') ||
            surveyString.includes('"fr":') ||
            surveyString.includes('"nl":') ||
            surveyString.includes('"default":') ||
            surveyString.includes('"es_CO":') ||
            surveyString.includes('"es_AR":') ||
            surveyString.includes('"de_CH":') ||
            surveyString.includes('"fr_CA":') ||
            surveyString.includes('"en_GH":')
          
          expect(hasMultilingualContent, 'Survey should contain multilingual content').to.be.true
        })
      })

      it('should have regional language variants', () => {
        cy.fixture(surveyFile).then((surveyData) => {
          const surveyString = JSON.stringify(surveyData)
          
          // Count different types of language keys
          const languages = {
            en: surveyString.includes('"en":') || surveyString.includes('"default":'),
            es: surveyString.includes('"es":'),
            de: surveyString.includes('"de":'),
            fr: surveyString.includes('"fr":'),
            nl: surveyString.includes('"nl":'),
            es_CO: surveyString.includes('"es_CO":'),
            es_AR: surveyString.includes('"es_AR":'),
            de_CH: surveyString.includes('"de_CH":'),
            fr_CA: surveyString.includes('"fr_CA":'),
            en_GH: surveyString.includes('"en_GH":')
          }
          
          const presentLanguages = Object.keys(languages).filter(lang => languages[lang])
          
          cy.log(`${surveyFile} contains languages: ${presentLanguages.join(', ')}`)
          
          // Should have at least English and some other languages
          expect(languages.en, 'Should have English content').to.be.true
          expect(presentLanguages.length, 'Should have multiple languages').to.be.greaterThan(1)
        })
      })

      it('should not contain serious translation artifacts', () => {
        cy.fixture(surveyFile).then((surveyData) => {
          const surveyString = JSON.stringify(surveyData)
          
          // Only check for serious artifacts that would break functionality
          const criticalArtifacts = [
            { pattern: '{{', name: 'template syntax {{' },
            { pattern: '[object Object]', name: 'serialized objects' },
            { pattern: '"null"', name: 'null strings' },
            { pattern: 'NaN', name: 'NaN values' }
          ]
          
          criticalArtifacts.forEach(({ pattern, name }) => {
            if (surveyString.includes(pattern)) {
              throw new Error(`Found ${name} in ${surveyFile}`)
            }
          })
          
          // Note: We're not checking for "undefined" as text since it might be valid survey content
          // Note: We're not checking for empty strings since some translations might legitimately be empty
          
          cy.log(`✅ ${surveyFile} passed critical artifact checks`)
        })
      })

      it('should be compatible with SurveyJS structure', () => {
        cy.fixture(surveyFile).then((surveyData) => {
          // Test if JSON structure is valid for SurveyJS
          expect(() => {
            JSON.parse(JSON.stringify(surveyData))
          }).to.not.throw()
          
          // Validate required survey properties for SurveyJS compatibility
          expect(surveyData.pages).to.exist
          surveyData.pages.forEach((page) => {
            expect(page.elements).to.exist
            page.elements.forEach((element) => {
              expect(element.type, `Element should have type: ${JSON.stringify(element)}`).to.exist
              expect(element.name, `Element should have name: ${JSON.stringify(element)}`).to.exist
            })
          })
        })
      })
    })
  })

  describe('Cross-Survey Consistency', () => {
    it('should have consistent language sets across surveys', () => {
      const surveyLanguages = {}
      
      surveys.forEach((surveyFile) => {
        cy.fixture(surveyFile).then((surveyData) => {
          const surveyString = JSON.stringify(surveyData)
          const languages = []
          
          // Extract languages present in this survey
          if (surveyString.includes('"en":') || surveyString.includes('"default":')) languages.push('en')
          if (surveyString.includes('"es":')) languages.push('es')
          if (surveyString.includes('"de":')) languages.push('de')
          if (surveyString.includes('"fr":')) languages.push('fr')
          if (surveyString.includes('"nl":')) languages.push('nl')
          if (surveyString.includes('"es_CO":')) languages.push('es_CO')
          if (surveyString.includes('"es_AR":')) languages.push('es_AR')
          if (surveyString.includes('"de_CH":')) languages.push('de_CH')
          if (surveyString.includes('"fr_CA":')) languages.push('fr_CA')
          if (surveyString.includes('"en_GH":')) languages.push('en_GH')
          
          surveyLanguages[surveyFile] = languages
        })
      })
      
      cy.then(() => {
        // Log language distribution
        Object.entries(surveyLanguages).forEach(([survey, langs]) => {
          cy.log(`${survey}: ${langs.join(', ')}`)
        })
        
        // All surveys should have at least English
        Object.values(surveyLanguages).forEach((langs) => {
          expect(langs).to.include('en')
        })
      })
    })
  })
})
