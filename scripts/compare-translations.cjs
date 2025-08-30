#!/usr/bin/env node

const fs = require('fs');
const https = require('https');

// Function to fetch JSON from URL
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

// Function to recursively find all translation objects
function findTranslationObjects(obj, path = '') {
  const results = [];
  
  if (typeof obj !== 'object' || obj === null) {
    return results;
  }
  
  // Check if this object has translation keys (contains 'default' or language codes)
  if (obj.hasOwnProperty('default') || obj.hasOwnProperty('es') || obj.hasOwnProperty('es-CO')) {
    results.push({
      path: path,
      translations: obj
    });
  } else {
    // Recursively check nested objects
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        const newPath = path ? `${path}.${key}` : key;
        results.push(...findTranslationObjects(value, newPath));
      }
    }
  }
  
  return results;
}

// Function to compare translations
function compareTranslations(lang1, lang2, surveyData) {
  const translationObjects = findTranslationObjects(surveyData);
  const results = {
    identical: [],
    different: [],
    onlyInLang1: [],
    onlyInLang2: [],
    total: translationObjects.length
  };
  
  translationObjects.forEach(({ path, translations }) => {
    const text1 = translations[lang1];
    const text2 = translations[lang2];
    
    if (text1 && text2) {
      if (text1 === text2) {
        results.identical.push({ path, text: text1 });
      } else {
        results.different.push({ 
          path, 
          [lang1]: text1, 
          [lang2]: text2 
        });
      }
    } else if (text1 && !text2) {
      results.onlyInLang1.push({ path, text: text1 });
    } else if (!text1 && text2) {
      results.onlyInLang2.push({ path, text: text2 });
    }
  });
  
  return results;
}

async function main() {
  const buckets = {
    dev: 'https://storage.googleapis.com/levante-assets-dev/surveys/child_survey.json',
    prod: 'https://storage.googleapis.com/levante-dashboard-prod/child_survey.json'
  };
  
  console.log('🔍 Comparing es vs es-CO translations in child survey...\n');
  
  for (const [bucketName, url] of Object.entries(buckets)) {
    try {
      console.log(`📁 Analyzing ${bucketName.toUpperCase()} bucket: ${url}`);
      
      // Add cache busting
      const cacheBustedUrl = `${url}?t=${Date.now()}`;
      const surveyData = await fetchJson(cacheBustedUrl);
      
      const comparison = compareTranslations('es', 'es-CO', surveyData);
      
      console.log(`\n📊 Results for ${bucketName.toUpperCase()}:`);
      console.log(`   Total translation objects: ${comparison.total}`);
      console.log(`   ✅ Identical (es = es-CO): ${comparison.identical.length}`);
      console.log(`   ❌ Different (es ≠ es-CO): ${comparison.different.length}`);
      console.log(`   📝 Only in es: ${comparison.onlyInLang1.length}`);
      console.log(`   📝 Only in es-CO: ${comparison.onlyInLang2.length}`);
      
      if (comparison.different.length > 0) {
        console.log(`\n🔍 Different translations in ${bucketName}:`);
        comparison.different.slice(0, 5).forEach(({ path, es, 'es-CO': esCO }) => {
          console.log(`   Path: ${path}`);
          console.log(`   ES: ${es?.substring(0, 100)}${es?.length > 100 ? '...' : ''}`);
          console.log(`   ES-CO: ${esCO?.substring(0, 100)}${esCO?.length > 100 ? '...' : ''}`);
          console.log('   ---');
        });
        if (comparison.different.length > 5) {
          console.log(`   ... and ${comparison.different.length - 5} more differences`);
        }
      }
      
      if (comparison.onlyInLang1.length > 0) {
        console.log(`\n📝 Translations only in ES (missing es-CO) in ${bucketName}:`);
        comparison.onlyInLang1.slice(0, 3).forEach(({ path }) => {
          console.log(`   - ${path}`);
        });
        if (comparison.onlyInLang1.length > 3) {
          console.log(`   ... and ${comparison.onlyInLang1.length - 3} more`);
        }
      }
      
      if (comparison.onlyInLang2.length > 0) {
        console.log(`\n📝 Translations only in ES-CO (missing es) in ${bucketName}:`);
        comparison.onlyInLang2.slice(0, 3).forEach(({ path }) => {
          console.log(`   - ${path}`);
        });
        if (comparison.onlyInLang2.length > 3) {
          console.log(`   ... and ${comparison.onlyInLang2.length - 3} more`);
        }
      }
      
      console.log('\n' + '='.repeat(80) + '\n');
      
    } catch (error) {
      console.error(`❌ Error analyzing ${bucketName}:`, error.message);
    }
  }
}

main().catch(console.error);
