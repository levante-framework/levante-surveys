/**
 * Basic Survey Test - Simple verification that the test setup works
 */

describe('Survey Test Page Basic Verification', () => {
  it('should load the survey test page', () => {
    cy.visit('/survey-test')

    // Check that the page loads
    cy.contains('Survey Testing Page').should('be.visible')

    // Check that there are survey options
    cy.get('select').first().should('exist')

    // Check that the survey container exists
    cy.get('[data-testid="survey-container"]').should('exist')
  })

  it('should have survey loading functionality available', () => {
    cy.visit('/survey-test')

    // Wait for the component to mount
    cy.window().should('have.property', 'loadSurveyFromData')

    cy.window().then((win) => {
      expect(win.loadSurveyFromData).to.be.a('function')
    })
  })

  it('should be able to load a simple survey', () => {
    cy.visit('/survey-test')

    // Wait for loading function
    cy.window().should('have.property', 'loadSurveyFromData')

    // Load a simple survey directly
    cy.window().then((win) => {
      const simpleSurvey = {
        "pages": [
          {
            "name": "page1",
            "elements": [
              {
                "type": "text",
                "name": "question1",
                "title": "What is your name?"
              }
            ]
          }
        ]
      }

      win.loadSurveyFromData(simpleSurvey)
    })

    // Verify the survey model was created and has the expected question
    cy.window().its('testSurvey').should('exist')
    cy.window().then((win) => {
      const q = win.testSurvey.getQuestionByName('question1')
      expect(q, 'question should exist in model').to.exist
      expect(q.title).to.contain('What is your name?')
    })
  })
})
