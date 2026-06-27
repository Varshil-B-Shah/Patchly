import { SyntaxKind, type JsxElement } from 'ts-morph'
import type { JsxNode, OpResult } from '../types.js'
import type { SetTextOp } from '../../../shared/operations.js'

export function setText(node: JsxNode, op: SetTextOp): OpResult {
  if (node.getKind() === SyntaxKind.JsxSelfClosingElement) {
    return { ok: false, code: 'UNSUPPORTED_TARGET', message: 'A self-closing element has no text to set.' }
  }

  const el = node as JsxElement

  for (const child of el.getJsxChildren()) {
    const kind = child.getKind()
    if (kind === SyntaxKind.JsxText) continue
    return {
      ok: false,
      code: 'MIXED_CHILDREN',
      message: 'This element has non-text children, so its text cannot be set directly.',
    }
  }

  const opening = el.getOpeningElement()
  const closing = el.getClosingElement()
  el.getSourceFile().replaceText([opening.getEnd(), closing.getStart()], op.text)
  return { ok: true }
}
