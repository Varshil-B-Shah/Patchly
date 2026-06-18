// agent/ast/operations/_util.js
// Shared helpers for the operation executors. Pure ts-morph manipulation —
// no LLM coupling (hard rule: this layer is also the drag-drop code path).

import { SyntaxKind } from 'ts-morph'

// JsxElement → its opening element; JsxSelfClosingElement → itself.
export function getOpening(node) {
  return node.getKind() === SyntaxKind.JsxSelfClosingElement
    ? node
    : node.getOpeningElement()
}

// Split a className string into tokens.
export function tokenizeClasses(str) {
  return str.split(/\s+/).filter(Boolean)
}

// Apply `remove` then `add` to an existing class list: dedupe, preserve the
// existing order, append genuinely-new classes at the end.
export function mergeClasses(existing, add = [], remove = []) {
  const removeSet = new Set(remove)
  const result = []
  const seen = new Set()
  for (const cls of existing) {
    if (removeSet.has(cls) || seen.has(cls)) continue
    result.push(cls)
    seen.add(cls)
  }
  for (const cls of add) {
    if (removeSet.has(cls) || seen.has(cls)) continue
    result.push(cls)
    seen.add(cls)
  }
  return result
}

// Double-quoted, escaped string literal text for an attribute value.
export function quoteAttr(value) {
  return JSON.stringify(value)
}

// An object-literal property name: bare identifier if valid, else quoted.
export function propName(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key)
}

// A valid (HTML or component) JSX tag name.
export function isValidTagName(tag) {
  return /^[A-Za-z][A-Za-z0-9._-]*$/.test(tag)
}

let tmpCounter = 0

// Parse-check a JSX payload BEFORE mutating the real file. `mode` is
// 'children' (text/elements/expressions between tags) or 'element' (a single
// expression). Returns true if the snippet is syntactically valid.
export function validateJsxSnippet(project, snippet, mode = 'children') {
  const wrapped =
    mode === 'element' ? `const __p = (${snippet});` : `const __p = <>${snippet}</>;`
  const tmpPath = `__patchly_validate_${tmpCounter++}.tsx`
  const tmp = project.createSourceFile(tmpPath, wrapped, { overwrite: true })
  try {
    const diagnostics = project.getProgram().getSyntacticDiagnostics(tmp)
    return diagnostics.length === 0
  } finally {
    project.removeSourceFile(tmp)
  }
}
