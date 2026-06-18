// agent/ast/operations/insertChild.js
// Parse a jsx payload and insert it as a child at first / last / index.

import { SyntaxKind } from 'ts-morph'
import { validateJsxSnippet } from './_util.js'

export function insertChild(node, op) {
  if (node.getKind() === SyntaxKind.JsxSelfClosingElement) {
    return { ok: false, code: 'UNSUPPORTED_TARGET', message: 'Cannot insert children into a self-closing element.' }
  }

  const { jsx, position } = op

  if (!validateJsxSnippet(node.getSourceFile().getProject(), jsx, 'children')) {
    return { ok: false, code: 'INVALID_JSX', message: 'The inserted JSX is not valid.' }
  }

  const opening = node.getOpeningElement()
  const closing = node.getClosingElement()

  // Meaningful children = elements, fragments and expressions (skip whitespace text).
  const children = node.getJsxChildren().filter((c) => {
    const kind = c.getKind()
    if (kind === SyntaxKind.JsxText) return c.getText().trim() !== ''
    return true
  })

  let offset
  if (position === 'first' || children.length === 0) {
    offset = opening.getEnd()
  } else if (position === 'last') {
    offset = closing.getStart()
  } else {
    const idx = Math.max(0, Math.min(Number(position), children.length))
    offset = idx >= children.length ? closing.getStart() : children[idx].getStart()
  }

  node.getSourceFile().insertText(offset, jsx)
  return { ok: true }
}
