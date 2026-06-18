// agent/ast/operations/setAttribute.js
// Add, update, or remove a JSX attribute. value === null removes it.

import { SyntaxKind } from 'ts-morph'
import { getOpening, quoteAttr } from './_util.js'

export function setAttribute(node, op) {
  const { name, value } = op
  const opening = getOpening(node)
  const attr = opening.getAttribute(name)

  // Remove
  if (value === null) {
    if (attr) attr.remove()
    return { ok: true }
  }

  // Update existing plain attribute
  if (attr) {
    if (attr.getKind() !== SyntaxKind.JsxAttribute) {
      return { ok: false, code: 'UNSUPPORTED_TARGET', message: `Cannot set spread attribute ${name}.` }
    }
    attr.setInitializer(quoteAttr(value))
    return { ok: true }
  }

  // Add new
  opening.addAttribute({ name, initializer: quoteAttr(value) })
  return { ok: true }
}
