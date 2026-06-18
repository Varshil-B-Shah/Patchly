// agent/ast/operations/index.js
// Operation executor registry + dispatcher. Keyed by the shared OPS names so the
// same operations can be produced by the LLM (6.8) or the future drag-drop UI.

import { OPS } from '../../../shared/operations.js'
import { setClassName } from './setClassName.js'
import { setAttribute } from './setAttribute.js'
import { setText } from './setText.js'
import { setInlineStyle } from './setInlineStyle.js'
import { wrapElement } from './wrapElement.js'
import { insertChild } from './insertChild.js'
import { replaceElement } from './replaceElement.js'
import { removeElement } from './removeElement.js'

const EXECUTORS = {
  [OPS.SET_CLASS_NAME]: setClassName,
  [OPS.SET_ATTRIBUTE]: setAttribute,
  [OPS.SET_TEXT]: setText,
  [OPS.SET_INLINE_STYLE]: setInlineStyle,
  [OPS.WRAP_ELEMENT]: wrapElement,
  [OPS.INSERT_CHILD]: insertChild,
  [OPS.REPLACE_ELEMENT]: replaceElement,
  [OPS.REMOVE_ELEMENT]: removeElement,
}

// Apply a single EditOperation to an already-resolved JSX node (mutates in place).
export function applyOperation(node, op) {
  const fn = EXECUTORS[op.op]
  if (!fn) {
    return { ok: false, code: 'UNKNOWN_OP', message: `Unknown operation: ${op.op}` }
  }
  return fn(node, op)
}

export { EXECUTORS }
