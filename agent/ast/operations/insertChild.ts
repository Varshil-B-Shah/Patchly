import { SyntaxKind, type JsxElement } from 'ts-morph'
import { validateJsxSnippet } from './_util.js'
import type { JsxNode, OpResult } from '../types.js'
import type { InsertChildOp } from '../../../shared/operations.js'

export function insertChild(node: JsxNode, op: InsertChildOp): OpResult {
  if (node.getKind() === SyntaxKind.JsxSelfClosingElement) {
    return { ok: false, code: 'UNSUPPORTED_TARGET', message: 'Cannot insert children into a self-closing element.' }
  }

  const el = node as JsxElement
  const { jsx, position } = op

  if (!validateJsxSnippet(el.getSourceFile().getProject(), jsx, 'children')) {
    return { ok: false, code: 'INVALID_JSX', message: 'The inserted JSX is not valid.' }
  }

  const opening = el.getOpeningElement()
  const closing = el.getClosingElement()

  const children = el.getJsxChildren().filter((c) => {
    const kind = c.getKind()
    if (kind === SyntaxKind.JsxText) return c.getText().trim() !== ''
    return true
  })

  let offset: number
  if (position === 'first' || children.length === 0) {
    offset = opening.getEnd()
  } else if (position === 'last') {
    offset = closing.getStart()
  } else {
    const idx = Math.max(0, Math.min(Number(position), children.length))
    offset = idx >= children.length ? closing.getStart() : children[idx].getStart()
  }

  el.getSourceFile().insertText(offset, jsx)
  return { ok: true }
}
