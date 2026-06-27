import type { JsxNode, OpResult } from '../types.js'
import type { RemoveElementOp } from '../../../shared/operations.js'

export function removeElement(node: JsxNode, _op: RemoveElementOp): OpResult {
  node.getSourceFile().removeText(node.getFullStart(), node.getEnd())
  return { ok: true }
}
