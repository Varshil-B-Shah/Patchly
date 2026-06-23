// agent/ast/operations/index.ts
// Operation executor registry + dispatcher. Keyed by the shared OPS names so the
// same operations can be produced by the LLM (6.8) or the future drag-drop UI.

import type { Project } from 'ts-morph'
import { OPS, type EditOperation } from '../../../shared/operations.js'
import type { JsxNode, OpResult } from '../types.js'
import { setClassName } from './setClassName.js'
import { setAttribute } from './setAttribute.js'
import { setText } from './setText.js'
import { setInlineStyle } from './setInlineStyle.js'
import { wrapElement } from './wrapElement.js'
import { insertChild } from './insertChild.js'
import { replaceElement } from './replaceElement.js'
import { removeElement } from './removeElement.js'
import { setExpression } from './setExpression.js'

// Each executor accepts its specific op subtype; the registry erases that down to
// the EditOperation union at the dispatch boundary (the cast is honest: the
// dispatcher only ever calls an executor with the op whose `op` field selected it).
// project is optional and only used by executors that need it (e.g. setExpression).
type Executor = (node: JsxNode, op: EditOperation, project?: Project) => OpResult

const EXECUTORS: Record<string, Executor> = {
  [OPS.SET_CLASS_NAME]: setClassName as Executor,
  [OPS.SET_ATTRIBUTE]: setAttribute as Executor,
  [OPS.SET_TEXT]: setText as Executor,
  [OPS.SET_INLINE_STYLE]: setInlineStyle as Executor,
  [OPS.WRAP_ELEMENT]: wrapElement as Executor,
  [OPS.INSERT_CHILD]: insertChild as Executor,
  [OPS.REPLACE_ELEMENT]: replaceElement as Executor,
  [OPS.REMOVE_ELEMENT]: removeElement as Executor,
  [OPS.SET_EXPRESSION]: setExpression as Executor,
}

// Apply a single EditOperation to an already-resolved JSX node (mutates in place).
export function applyOperation(node: JsxNode, op: EditOperation, project?: Project): OpResult {
  const fn = EXECUTORS[op.op]
  if (!fn) {
    return { ok: false, code: 'UNKNOWN_OP', message: `Unknown operation: ${op.op}` }
  }
  return fn(node, op, project)
}

export { EXECUTORS }
