// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

/**
 * Custom command to load a survey JSON file
 */
Cypress.Commands.add('loadSurvey', (surveyFile) => {
  cy.fixture(surveyFile).as('surveyData')
  cy.get('@surveyData').then((surveyData) => {
    cy.window().then((win) => {
      // Use the loadSurveyFromData function exposed by the Vue component
      if (win.loadSurveyFromData) {
        win.loadSurveyFromData(surveyData)
        return win.testSurvey
      } else {
        throw new Error('Survey loading function not available')
      }
    })
  })
})

/**
 * Custom command to verify survey renders without errors
 */
Cypress.Commands.add('verifySurveyRenders', () => {
  // Check that the survey container exists and has content
  cy.get('[data-testid="survey-container"]', { timeout: 10000 })
    .should('exist')
    .and('be.visible')
  
  // Verify no error messages are displayed
  cy.get('body').should('not.contain', 'Error')
  cy.get('body').should('not.contain', 'undefined')
  cy.get('body').should('not.contain', 'null')
})

/**
 * Custom command to verify survey has questions
 */
Cypress.Commands.add('verifySurveyHasQuestions', () => {
  // Check for survey questions/elements
  cy.get('.sv-question', { timeout: 5000 })
    .should('have.length.greaterThan', 0)
})

/**
 * Custom command to verify multilingual support
 */
Cypress.Commands.add('verifyMultilingualSupport', (languages = ['en', 'es', 'de']) => {
  languages.forEach((lang) => {
    cy.window().then((win) => {
      if (win.testSurvey) {
        // Test language switching
        win.testSurvey.locale = lang
        cy.wait(500) // Give time for re-render
        
        // Verify survey still renders properly
        cy.get('[data-testid="survey-container"]')
          .should('exist')
          .and('be.visible')
      }
    })
  })
})

/**
 * Custom command to simulate survey completion
 */
Cypress.Commands.add('completeSurvey', () => {
  // Get all visible questions and attempt to answer them
  cy.get('.sv-question').each(($question) => {
    cy.wrap($question).within(() => {
      // Handle different question types
      cy.get('input[type="radio"]').first().then(($radio) => {
        if ($radio.length > 0) {
          cy.wrap($radio).check({ force: true })
        }
      })
      
      cy.get('input[type="checkbox"]').first().then(($checkbox) => {
        if ($checkbox.length > 0) {
          cy.wrap($checkbox).check({ force: true })
        }
      })
      
      cy.get('input[type="text"]').first().then(($text) => {
        if ($text.length > 0) {
          cy.wrap($text).type('Test response', { force: true })
        }
      })
      
      cy.get('textarea').first().then(($textarea) => {
        if ($textarea.length > 0) {
          cy.wrap($textarea).type('Test response', { force: true })
        }
      })
      
      cy.get('select').first().then(($select) => {
        if ($select.length > 0) {
          cy.wrap($select).select(1, { force: true })
        }
      })
    })
  })
  
  // Submit the survey if there's a submit button
  cy.get('input[type="submit"], button[type="submit"], .sv-btn--submit')
    .first()
    .then(($submit) => {
      if ($submit.length > 0) {
        cy.wrap($submit).click({ force: true })
      }
    })
})
