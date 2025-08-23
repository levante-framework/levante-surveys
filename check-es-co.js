const survey = require('./public/surveys/child_survey.json');

function findMissingEsCo(obj, path = '') {
  if (typeof obj !== 'object' || obj === null) return;

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (typeof value === 'object' && value !== null) {
      // Check if this object has translations but missing es-CO
      const hasTranslations = Object.keys(value).some(k =>
        ['default', 'es', 'de', 'fr', 'nl', 'es-CO', 'es_co'].includes(k)
      );

      if (hasTranslations) {
        const hasEsCo = value['es-CO'] !== undefined || value['es_co'] !== undefined;
        const hasDefault = value['default'] !== undefined;
        const hasEs = value['es'] !== undefined;

        if (!hasEsCo && (hasDefault || hasEs)) {
          console.log(`Missing es-CO at: ${currentPath}`);
          console.log(`Available keys: ${Object.keys(value).join(', ')}`);
          console.log('---');
        }
      }

      findMissingEsCo(value, currentPath);
    }
  }
}

console.log('Checking for missing es-CO translations in child survey...');
findMissingEsCo(survey);
console.log('Check complete.');

