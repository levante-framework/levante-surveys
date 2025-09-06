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


