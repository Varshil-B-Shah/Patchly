// agent/ast/operations/replaceElement.js
// Replace the whole target element with parsed jsx.

import { validateJsxSnippet } from './_util.js'

export function replaceElement(node, op) {
  if (!validateJsxSnippet(node.getSourceFile().getProject(), op.jsx, 'element')) {
    return { ok: false, code: 'INVALID_JSX', message: 'The replacement JSX is not valid.' }
  }

  node.replaceWithText(op.jsx)
  return { ok: true }
}
