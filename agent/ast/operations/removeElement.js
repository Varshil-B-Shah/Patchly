// agent/ast/operations/removeElement.js
// Remove the target element along with its leading whitespace/trivia.

export function removeElement(node, _op) {
  node.getSourceFile().removeText(node.getFullStart(), node.getEnd())
  return { ok: true }
}
