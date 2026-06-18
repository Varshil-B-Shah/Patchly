// agent/ast/operations/wrapElement.js
// Wrap the target element in a new element with an optional className.

import { isValidTagName, quoteAttr, validateJsxSnippet } from './_util.js'

export function wrapElement(node, op) {
  const { wrapperTag, wrapperClassName } = op

  if (!isValidTagName(wrapperTag)) {
    return { ok: false, code: 'UNSUPPORTED_TARGET', message: `Invalid wrapper tag: ${wrapperTag}` }
  }

  const cls = wrapperClassName ? ` className=${quoteAttr(wrapperClassName)}` : ''
  const wrapped = `<${wrapperTag}${cls}>${node.getText()}</${wrapperTag}>`

  if (!validateJsxSnippet(node.getSourceFile().getProject(), wrapped, 'element')) {
    return { ok: false, code: 'INVALID_JSX', message: 'Wrapping would produce invalid JSX.' }
  }

  node.replaceWithText(wrapped)
  return { ok: true }
}
