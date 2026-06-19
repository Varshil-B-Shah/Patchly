// agent/ast/operations/replaceElement.ts
// Replace the whole target element with parsed jsx.

import { validateJsxSnippet } from './_util.js'
import type { JsxNode, OpResult } from '../types.js'
import type { ReplaceElementOp } from '../../../shared/operations.js'

export function replaceElement(node: JsxNode, op: ReplaceElementOp): OpResult {
  if (!validateJsxSnippet(node.getSourceFile().getProject(), op.jsx, 'element')) {
    return { ok: false, code: 'INVALID_JSX', message: 'The replacement JSX is not valid.' }
  }

  node.replaceWithText(op.jsx)
  return { ok: true }
}
