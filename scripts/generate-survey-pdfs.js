#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import puppeteer from 'puppeteer'

// Get current directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Survey files to process
const SURVEY_FILES = [
  'child_survey.json',
  'parent_survey_child.json',
  'parent_survey_family.json',
  'teacher_survey_classroom.json',
  'teacher_survey_general.json'
];

// Helper function to extract text from multilingual objects
function extractText(obj, language = 'default') {
  if (typeof obj === 'string') {
    return obj;
  }
  if (typeof obj === 'object' && obj !== null) {
    return obj[language] || obj.default || obj.en || Object.values(obj)[0] || '';
  }
  return '';
}

// Helper function to sanitize HTML
function sanitizeHtml(html) {
  if (!html) return '';
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Helper function to render HTML content safely
function renderHtml(content) {
  if (!content) return '';
  // If content looks like HTML (contains tags), render it as-is
  if (content.includes('<') && content.includes('>')) {
    return content;
  }
  // Otherwise, sanitize it
  return sanitizeHtml(content);
}

// Function to convert survey JSON to HTML
function convertSurveyToHtml(surveyData, surveyName) {
  const title = extractText(surveyData.title) || surveyName.replace(/_/g, ' ').replace(/\.json$/, '');

  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${sanitizeHtml(title)}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            margin: 40px;
            color: #333;
            max-width: 800px;
        }
        .survey-header {
            border-bottom: 3px solid #007acc;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .survey-title {
            font-size: 28px;
            font-weight: bold;
            color: #007acc;
            margin: 0;
        }
        .survey-description {
            font-size: 16px;
            color: #666;
            margin-top: 10px;
        }
        .page {
            margin-bottom: 40px;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            background-color: #fafafa;
        }
        .page-title {
            font-size: 20px;
            font-weight: bold;
            color: #007acc;
            margin-bottom: 15px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
        }
        .page-description {
            font-size: 14px;
            color: #666;
            margin-bottom: 20px;
            font-style: italic;
        }
        .question {
            margin-bottom: 25px;
            padding: 15px;
            background-color: white;
            border-radius: 6px;
            border-left: 4px solid #007acc;
        }
        .question-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 10px;
            color: #333;
        }
        .question-description {
            font-size: 14px;
            color: #666;
            margin-bottom: 15px;
            font-style: italic;
        }
        .choices {
            margin-left: 20px;
        }
        .choice {
            margin-bottom: 8px;
            font-size: 14px;
        }
        .choice-value {
            font-weight: bold;
            color: #007acc;
        }
        .matrix-columns {
            margin-left: 20px;
            margin-bottom: 10px;
        }
        .matrix-column {
            display: inline-block;
            margin-right: 20px;
            font-size: 14px;
            font-weight: bold;
            color: #007acc;
        }
        .matrix-rows {
            margin-left: 20px;
        }
        .matrix-row {
            margin-bottom: 8px;
            font-size: 14px;
        }
        .input-type {
            font-size: 12px;
            color: #888;
            font-style: italic;
            margin-top: 5px;
        }
        .panel {
            background-color: #f0f8ff;
            border: 1px solid #b3d9ff;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 20px;
        }
        .panel-title {
            font-size: 18px;
            font-weight: bold;
            color: #0066cc;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="survey-header">
        <h1 class="survey-title">${sanitizeHtml(title)}</h1>
        ${surveyData.description ? `<div class="survey-description">${renderHtml(extractText(surveyData.description))}</div>` : ''}
    </div>
`;

  // Process pages
  if (surveyData.pages && Array.isArray(surveyData.pages)) {
    surveyData.pages.forEach((page, pageIndex) => {
      const pageTitle = extractText(page.title) || extractText(page.name) || `Page ${pageIndex + 1}`;

      html += `    <div class="page">
        <div class="page-title">${sanitizeHtml(pageTitle)}</div>`;

      if (page.description) {
        html += `        <div class="page-description">${renderHtml(extractText(page.description))}</div>`;
      }

      // Process elements (questions)
      if (page.elements && Array.isArray(page.elements)) {
        page.elements.forEach((element) => {
          html += processElement(element);
        });
      }

      html += `    </div>\n`;
    });
  }

  html += `</body>\n</html>`;
  return html;
}

// Function to process different types of survey elements
function processElement(element) {
  let html = '';

  const elementTitle = extractText(element.title) || extractText(element.name) || 'Untitled Question';
  const elementDescription = element.description ? extractText(element.description) : '';

  // Handle panels (groups of questions)
  if (element.type === 'panel') {
    html += `        <div class="panel">
            <div class="panel-title">${sanitizeHtml(elementTitle)}</div>`;

    if (elementDescription) {
      html += `            <div class="page-description">${renderHtml(elementDescription)}</div>`;
    }

    if (element.elements && Array.isArray(element.elements)) {
      element.elements.forEach((subElement) => {
        html += processElement(subElement);
      });
    }

    html += `        </div>\n`;
    return html;
  }

  // Regular questions
  html += `        <div class="question">
            <div class="question-title">${sanitizeHtml(elementTitle)}</div>`;

  if (elementDescription) {
    html += `            <div class="question-description">${renderHtml(elementDescription)}</div>`;
  }

  // Add input type indicator
  html += `            <div class="input-type">Type: ${element.type || 'unknown'}</div>`;

  // Handle different question types
  switch (element.type) {
    case 'radiogroup':
    case 'checkbox':
    case 'dropdown':
      if (element.choices && Array.isArray(element.choices)) {
        html += `            <div class="choices">`;
        element.choices.forEach((choice) => {
          const choiceText = typeof choice === 'string' ? choice : extractText(choice.text);
          const choiceValue = typeof choice === 'string' ? choice : (choice.value || choiceText);
          html += `                <div class="choice"><span class="choice-value">${sanitizeHtml(choiceValue)}</span>: ${sanitizeHtml(choiceText)}</div>`;
        });
        html += `            </div>`;
      }
      break;

    case 'matrix':
    case 'matrixdynamic':
    case 'matrixdropdown':
      if (element.columns && Array.isArray(element.columns)) {
        html += `            <div class="matrix-columns">`;
        element.columns.forEach((column) => {
          const columnTitle = extractText(column.title) || extractText(column.name) || column.value || 'Column';
          html += `                <span class="matrix-column">${sanitizeHtml(columnTitle)}</span>`;
        });
        html += `            </div>`;
      }

      if (element.rows && Array.isArray(element.rows)) {
        html += `            <div class="matrix-rows">`;
        element.rows.forEach((row) => {
          const rowText = typeof row === 'string' ? row : extractText(row.text);
          const rowValue = typeof row === 'string' ? row : (row.value || rowText);
          html += `                <div class="matrix-row"><span class="choice-value">${sanitizeHtml(rowValue)}</span>: ${sanitizeHtml(rowText)}</div>`;
        });
        html += `            </div>`;
      }
      break;

    case 'text':
    case 'comment':
    case 'number':
      if (element.placeholder) {
        html += `            <div class="input-type">Placeholder: ${sanitizeHtml(extractText(element.placeholder))}</div>`;
      }
      break;
  }

  html += `        </div>\n`;
  return html;
}

// Main function to generate PDF for a survey
async function generateSurveyPdf(surveyFilePath, outputDir) {
  try {
    console.log(`Processing ${surveyFilePath}...`);

    // Read survey JSON
    const surveyData = JSON.parse(fs.readFileSync(surveyFilePath, 'utf8'));
    const surveyName = path.basename(surveyFilePath, '.json');

    // Convert to HTML
    const html = convertSurveyToHtml(surveyData, surveyName);

    // Launch Puppeteer
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Set content and generate PDF
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const outputPath = path.join(outputDir, `${surveyName}.pdf`);
    await page.pdf({
      path: outputPath,
      format: 'A4',
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm'
      },
      printBackground: true
    });

    await browser.close();

    console.log(`✅ Generated: ${outputPath}`);
    return outputPath;

  } catch (error) {
    console.error(`❌ Error generating PDF for ${surveyFilePath}:`, error.message);
    throw error;
  }
}

// Main execution
async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const surveysDir = path.join(projectRoot, 'surveys');
  const outputDir = path.join(surveysDir, 'pdf');

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`🚀 Starting PDF generation for ${SURVEY_FILES.length} surveys...`);
  console.log(`📁 Output directory: ${outputDir}`);

  const results = [];

  for (const surveyFile of SURVEY_FILES) {
    const surveyPath = path.join(surveysDir, surveyFile);

    if (!fs.existsSync(surveyPath)) {
      console.log(`⚠️  Skipping ${surveyFile} - file not found`);
      continue;
    }

    try {
      const outputPath = await generateSurveyPdf(surveyPath, outputDir);
      results.push({ survey: surveyFile, status: 'success', path: outputPath });
    } catch (error) {
      results.push({ survey: surveyFile, status: 'error', error: error.message });
    }
  }

  // Summary
  console.log('\n📊 PDF Generation Summary:');
  const successful = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status === 'error');

  console.log(`✅ Successfully generated: ${successful.length} PDFs`);
  successful.forEach(result => {
    console.log(`   - ${result.survey} → ${path.basename(result.path)}`);
  });

  if (failed.length > 0) {
    console.log(`❌ Failed: ${failed.length} surveys`);
    failed.forEach(result => {
      console.log(`   - ${result.survey}: ${result.error}`);
    });
  }

  console.log(`\n🎉 PDF generation complete! Files saved to: ${outputDir}`);
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { generateSurveyPdf, convertSurveyToHtml };
