// agent/ast/operations/setAttribute.ts
// Add, update, or remove a JSX attribute. value === null removes it.

import { SyntaxKind, type JsxAttribute } from 'ts-morph'
import { getOpening, quoteAttr } from './_util.js'
import type { JsxNode, OpResult } from '../types.js'
import type { SetAttributeOp } from '../../../shared/operations.js'

export function setAttribute(node: JsxNode, op: SetAttributeOp): OpResult {
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
    ;(attr as JsxAttribute).setInitializer(quoteAttr(value))
    return { ok: true }
  }

  // Add new
  opening.addAttribute({ name, initializer: quoteAttr(value) })
  return { ok: true }
}
