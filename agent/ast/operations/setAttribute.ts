import { SyntaxKind, type JsxAttribute } from 'ts-morph'
import { getOpening, quoteAttr } from './_util.js'
import type { JsxNode, OpResult } from '../types.js'
import type { SetAttributeOp } from '../../../shared/operations.js'

export function setAttribute(node: JsxNode, op: SetAttributeOp): OpResult {
  const { name, value } = op
  const opening = getOpening(node)
  const attr = opening.getAttribute(name)

  if (value === null) {
    if (attr) attr.remove()
    return { ok: true }
  }

  if (attr) {
    if (attr.getKind() !== SyntaxKind.JsxAttribute) {
      return { ok: false, code: 'UNSUPPORTED_TARGET', message: `Cannot set spread attribute ${name}.` }
    }
    ;(attr as JsxAttribute).setInitializer(quoteAttr(value))
    return { ok: true }
  }

  opening.addAttribute({ name, initializer: quoteAttr(value) })
  return { ok: true }
}
