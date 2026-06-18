// agent/ast/operations/setText.js
// Replace the text content of an element whose only children are text.

import { SyntaxKind } from 'ts-morph'

export function setText(node, op) {
  if (node.getKind() === SyntaxKind.JsxSelfClosingElement) {
    return { ok: false, code: 'UNSUPPORTED_TARGET', message: 'A self-closing element has no text to set.' }
  }

  // Refuse anything other than plain text children (elements/expressions/fragments).
  for (const child of node.getJsxChildren()) {
    const kind = child.getKind()
    if (kind === SyntaxKind.JsxText) continue
    return {
      ok: false,
      code: 'MIXED_CHILDREN',
      message: 'This element has non-text children, so its text cannot be set directly.',
    }
  }

  const opening = node.getOpeningElement()
  const closing = node.getClosingElement()
  node.getSourceFile().replaceText([opening.getEnd(), closing.getStart()], op.text)
  return { ok: true }
}
