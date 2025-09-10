// Shared normalization utilities

/**
 * Ensure that for any object representing a choice/item with a string `value`,
 * its `text` localization object exists and has a `default` key.
 * - If `text` is missing or null, create `{ default: value }`
 * - If `text.default` is missing, set it to `value`
 * Traverses the entire survey JSON in-place.
 * @param {any} root
 * @returns {number} number of items updated
 */
export function normalizeDefaultsFromValues(root) {
  let updatedCount = 0

  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }

    // If this looks like a choice-like object with a string value
    if (Object.prototype.hasOwnProperty.call(node, 'value')) {
      const val = node.value
      if (typeof val === 'string') {
        if (!Object.prototype.hasOwnProperty.call(node, 'text') || node.text == null) {
          node.text = { default: val }
          updatedCount++
        } else if (typeof node.text === 'object' && !Array.isArray(node.text)) {
          if (!Object.prototype.hasOwnProperty.call(node.text, 'default')) {
            node.text.default = val
            updatedCount++
          }
        }
      }
    }

    for (const key of Object.keys(node)) {
      const child = node[key]
      if (child && typeof child === 'object') visit(child)
    }
  }

  visit(root)
  return updatedCount
}

/**
 * Sanitize localized text fields throughout the survey JSON.
 * Ensures all localizable fields are objects with a `default` key and
 * replaces null/undefined with sensible defaults. Also coerces certain
 * arrays to [] instead of null/undefined.
 * Traversal is iterative to avoid deep recursion issues.
 * @param {any} root
 * @returns {number} number of fields normalized
 */
export function sanitizeLocalizedFields(root) {
  if (!root || typeof root !== 'object') return 0

  let updatedCount = 0

  const LOCALIZED_KEYS = new Set([
    'title',
    'description',
    'html',
    'label',
    'placeholder',
    'commentPlaceholder',
    'pageTitle',
    'questionTitleTemplate',
    'errorText',
    'tooltip',
    // In case some schemas use these
    'minErrorText',
    'maxErrorText',
    'requiredErrorText'
  ])

  const ARRAY_KEYS = new Set([
    'pages',
    'elements',
    'choices',
    'rows',
    'columns',
    'cells'
  ])

  const stack = [root]

  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue

    if (Array.isArray(node)) {
      for (const item of node) stack.push(item)
      continue
    }

    // Coerce arrays to [] if null/undefined
    for (const key of Object.keys(node)) {
      if (ARRAY_KEYS.has(key) && (node[key] == null || node[key] === false)) {
        node[key] = []
        updatedCount++
      }
    }

    // Normalize localized fields
    for (const key of Object.keys(node)) {
      const val = node[key]
      if (LOCALIZED_KEYS.has(key)) {
        if (val == null) {
          node[key] = { default: '' }
          updatedCount++
        } else if (typeof val === 'string') {
          node[key] = { default: val }
          updatedCount++
        } else if (typeof val === 'object' && !Array.isArray(val)) {
          // Drop null language entries and ensure default exists
          let mutated = false
          for (const [lk, lv] of Object.entries(val)) {
            if (lv == null) {
              delete val[lk]
              mutated = true
            }
          }
          if (!Object.prototype.hasOwnProperty.call(val, 'default')) {
            // Prefer 'en' or first available key
            const sourceKey = Object.prototype.hasOwnProperty.call(val, 'en')
              ? 'en'
              : Object.keys(val)[0]
            if (sourceKey) {
              val.default = val[sourceKey]
              mutated = true
            } else {
              val.default = ''
              mutated = true
            }
          }
          if (mutated) updatedCount++
        }
      }
    }

    // Normalize choice-like entries' text objects inside arrays/objects
    if (Array.isArray(node.choices)) {
      for (const choice of node.choices) {
        if (choice && typeof choice === 'object') {
          if (typeof choice.text === 'string') {
            choice.text = { default: choice.text }
            updatedCount++
          } else if (choice.text == null && typeof choice.value === 'string') {
            choice.text = { default: choice.value }
            updatedCount++
          } else if (choice.text && typeof choice.text === 'object') {
            // ensure default exists
            if (!Object.prototype.hasOwnProperty.call(choice.text, 'default')) {
              const ckeys = Object.keys(choice.text)
              if (ckeys.length > 0) {
                choice.text.default = choice.text.en ?? choice.text[ckeys[0]]
              } else if (typeof choice.value === 'string') {
                choice.text.default = choice.value
              } else {
                choice.text.default = ''
              }
              updatedCount++
            }
          }
        }
      }
    }

    // Continue traversal
    for (const key of Object.keys(node)) {
      const child = node[key]
      if (child && typeof child === 'object') stack.push(child)
    }
  }

  return updatedCount
}


/**
 * Harden survey structure:
 * - Ensure every question element has a non-empty string `name`
 * - Ensure `choices[].value` are strings, not null; deduplicate per question
 * - Ensure `defaultValue` matches question type (basic coercions)
 * - Remove null entries in arrays like `choices`, `rows`, `columns`
 * @param {any} root
 * @returns {number} number of fields normalized
 */
export function hardenSurveyStructure(root) {
  if (!root || typeof root !== 'object') return 0

  let updatedCount = 0
  let autoNameCounter = 1

  function ensureArray(arr) {
    if (!Array.isArray(arr)) return []
    return arr.filter((x) => x != null)
  }

  function coerceDefaultByType(q) {
    if (!q || typeof q !== 'object') return
    const t = q.type
    if (!Object.prototype.hasOwnProperty.call(q, 'defaultValue')) return
    let dv = q.defaultValue

    switch (t) {
      case 'checkbox':
        if (dv == null) return
        if (!Array.isArray(dv)) {
          if (typeof dv === 'string' || typeof dv === 'number' || typeof dv === 'boolean') {
            q.defaultValue = [String(dv)]
            updatedCount++
          } else {
            delete q.defaultValue
            updatedCount++
          }
        } else {
          // Coerce inner values to strings
          const coerced = dv.map((v) => (v == null ? '' : String(v)))
          if (JSON.stringify(coerced) !== JSON.stringify(dv)) {
            q.defaultValue = coerced
            updatedCount++
          }
        }
        break
      case 'radiogroup':
      case 'dropdown':
        if (dv == null) return
        if (typeof dv !== 'string') {
          if (typeof dv === 'number' || typeof dv === 'boolean') {
            q.defaultValue = String(dv)
            updatedCount++
          } else {
            delete q.defaultValue
            updatedCount++
          }
        }
        break
      case 'boolean':
        if (dv == null) return
        if (typeof dv === 'string') {
          if (dv.toLowerCase() === 'true') { q.defaultValue = true; updatedCount++ }
          else if (dv.toLowerCase() === 'false') { q.defaultValue = false; updatedCount++ }
          else { delete q.defaultValue; updatedCount++ }
        } else if (typeof dv !== 'boolean') {
          delete q.defaultValue
          updatedCount++
        }
        break
      case 'rating':
        if (dv == null) return
        if (typeof dv === 'string' && /^\d+$/.test(dv)) {
          q.defaultValue = parseInt(dv, 10)
          updatedCount++
        } else if (typeof dv !== 'number') {
          delete q.defaultValue
          updatedCount++
        }
        break
      case 'text':
      case 'comment':
        if (dv == null) return
        if (typeof dv !== 'string' && typeof dv !== 'number' && typeof dv !== 'boolean') {
          delete q.defaultValue
          updatedCount++
        } else if (typeof dv !== 'string') {
          q.defaultValue = String(dv)
          updatedCount++
        }
        break
      default:
        // For other types, if defaultValue is an object with complex shape and not expected,
        // leave as-is; only drop if it's clearly unusable (functions/undefined which shouldn't be present in JSON)
        break
    }
  }

  function processQuestion(q) {
    // Ensure name exists
    if (!q.name || typeof q.name !== 'string' || q.name.trim() === '') {
      q.name = `q_${autoNameCounter++}`
      updatedCount++
    }

    // Clean arrays
    if (q.choices != null) q.choices = ensureArray(q.choices)
    if (q.rows != null) q.rows = ensureArray(q.rows)
    if (q.columns != null) q.columns = ensureArray(q.columns)

    // Normalize choices values and dedupe per-question
    if (Array.isArray(q.choices)) {
      const seen = new Set()
      let idx = 1
      for (const choice of q.choices) {
        if (!choice || typeof choice !== 'object') continue
        // Normalize value
        if (choice.value == null || choice.value === '') {
          // Prefer text.default if available
          const fallback = typeof choice.text === 'object' && choice.text && choice.text.default
            ? String(choice.text.default)
            : `choice_${idx}`
          choice.value = fallback
          updatedCount++
        } else if (typeof choice.value !== 'string') {
          choice.value = String(choice.value)
          updatedCount++
        }
        // Deduplicate
        let val = choice.value
        if (seen.has(val)) {
          let suffix = 2
          while (seen.has(`${val}_${suffix}`)) suffix++
          choice.value = `${val}_${suffix}`
          updatedCount++
          seen.add(choice.value)
        } else {
          seen.add(val)
        }
        idx++
      }
    }

    // Coerce defaultValue to correct shape
    coerceDefaultByType(q)
  }

  // Walk pages/elements
  const pages = Array.isArray(root.pages) ? root.pages : []
  for (const page of pages) {
    if (!page || typeof page !== 'object') continue
    page.elements = ensureArray(page.elements)
    for (const el of page.elements) {
      if (!el || typeof el !== 'object') continue
      processQuestion(el)
      // Some questions may have nested columns/rows cells etc. We won't dive deeply for schema-specific types here
    }
  }

  return updatedCount
}


