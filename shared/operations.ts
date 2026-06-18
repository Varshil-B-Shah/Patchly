// shared/operations.ts
// The edit-operation contract — the single shared schema between (a) the LLM,
// (b) the AST executors in agent/ast/, and (c) the future drag-drop UI.
//
// HARD RULE: this layer is LLM-INDEPENDENT. The same operations the LLM emits
// will later be produced directly by a drag-drop / Figma-like UI with no LLM in
// the path. Never couple anything here to the LLM.

/**
 * A precise pointer to one JSX element in source, plus a fingerprint used to
 * confirm we re-resolved the SAME node before writing (drift guard, task 6.3).
 */
export interface EditTarget {
  /** Relative to projectRoot, e.g. "src/components/Hero.tsx". */
  file: string
  /** 1-based, from data-patchly-src. */
  line: number
  /** From data-patchly-src — improves precision. */
  column: number
  componentName?: string
  /** e.g. "button". */
  tagName: string
  /** id / key / data-testid if present. */
  identifyingAttrs?: Record<string, string>
  /** First ~40 chars of text content. */
  textSnippet?: string
}

export interface SetClassNameOp {
  op: 'setClassName'
  target: EditTarget
  add: string[]
  remove: string[]
}

export interface SetAttributeOp {
  op: 'setAttribute'
  target: EditTarget
  name: string
  /** null => remove the attribute. */
  value: string | null
}

export interface SetTextOp {
  op: 'setText'
  target: EditTarget
  text: string
}

export interface SetInlineStyleOp {
  op: 'setInlineStyle'
  target: EditTarget
  /** The op the drag-drop layer calls most. */
  styles: Record<string, string>
}

export interface WrapElementOp {
  op: 'wrapElement'
  target: EditTarget
  wrapperTag: string
  wrapperClassName?: string
}

export interface InsertChildOp {
  op: 'insertChild'
  target: EditTarget
  position: 'first' | 'last' | number
  jsx: string
}

export interface ReplaceElementOp {
  op: 'replaceElement'
  target: EditTarget
  jsx: string
}

export interface RemoveElementOp {
  op: 'removeElement'
  target: EditTarget
}

export type EditOperation =
  | SetClassNameOp
  | SetAttributeOp
  | SetTextOp
  | SetInlineStyleOp
  | WrapElementOp
  | InsertChildOp
  | ReplaceElementOp
  | RemoveElementOp

export interface EditRequest {
  explanation: string
  /** Array → multi-op + multi-file edits later, no schema change. */
  operations: EditOperation[]
  /** 0..1, model self-rated (refined in Phase 8). */
  confidence: number
}

// The canonical set of operation names. The 6.4 executor registry keys off this.
export const OPS = Object.freeze({
  SET_CLASS_NAME: 'setClassName',
  SET_ATTRIBUTE: 'setAttribute',
  SET_TEXT: 'setText',
  SET_INLINE_STYLE: 'setInlineStyle',
  WRAP_ELEMENT: 'wrapElement',
  INSERT_CHILD: 'insertChild',
  REPLACE_ELEMENT: 'replaceElement',
  REMOVE_ELEMENT: 'removeElement',
} as const)

/** Union of operation name string literals, e.g. "setClassName". */
export type OpName = (typeof OPS)[keyof typeof OPS]
