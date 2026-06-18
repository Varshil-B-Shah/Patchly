// shared/operations.js
// The edit-operation contract — the single shared schema between (a) the LLM,
// (b) the AST executors in agent/ast/, and (c) the future drag-drop UI.
//
// HARD RULE: this layer is LLM-INDEPENDENT. The same operations the LLM emits
// will later be produced directly by a drag-drop / Figma-like UI with no LLM in
// the path. Never couple anything here to the LLM.
//
// JSDoc-only types (no build step). Runtime export is the OPS name registry.

/**
 * A precise pointer to one JSX element in source, plus a fingerprint used to
 * confirm we re-resolved the SAME node before writing (drift guard, task 6.3).
 *
 * @typedef {Object} EditTarget
 * @property {string} file                 Relative to projectRoot, e.g. "src/components/Hero.tsx".
 * @property {number} line                 1-based, from data-patchly-src.
 * @property {number} column               From data-patchly-src — improves precision.
 * @property {string} [componentName]
 * @property {string} tagName              e.g. "button".
 * @property {Record<string,string>} [identifyingAttrs]  id / key / data-testid if present.
 * @property {string} [textSnippet]        First ~40 chars of text content.
 */

/**
 * @typedef {Object} SetClassNameOp
 * @property {"setClassName"} op
 * @property {EditTarget} target
 * @property {string[]} add
 * @property {string[]} remove
 */

/**
 * @typedef {Object} SetAttributeOp
 * @property {"setAttribute"} op
 * @property {EditTarget} target
 * @property {string} name
 * @property {string|null} value          null => remove the attribute.
 */

/**
 * @typedef {Object} SetTextOp
 * @property {"setText"} op
 * @property {EditTarget} target
 * @property {string} text
 */

/**
 * @typedef {Object} SetInlineStyleOp
 * @property {"setInlineStyle"} op
 * @property {EditTarget} target
 * @property {Record<string,string>} styles   The op the drag-drop layer calls most.
 */

/**
 * @typedef {Object} WrapElementOp
 * @property {"wrapElement"} op
 * @property {EditTarget} target
 * @property {string} wrapperTag
 * @property {string} [wrapperClassName]
 */

/**
 * @typedef {Object} InsertChildOp
 * @property {"insertChild"} op
 * @property {EditTarget} target
 * @property {"first"|"last"|number} position
 * @property {string} jsx
 */

/**
 * @typedef {Object} ReplaceElementOp
 * @property {"replaceElement"} op
 * @property {EditTarget} target
 * @property {string} jsx
 */

/**
 * @typedef {Object} RemoveElementOp
 * @property {"removeElement"} op
 * @property {EditTarget} target
 */

/**
 * @typedef {SetClassNameOp
 *   | SetAttributeOp
 *   | SetTextOp
 *   | SetInlineStyleOp
 *   | WrapElementOp
 *   | InsertChildOp
 *   | ReplaceElementOp
 *   | RemoveElementOp} EditOperation
 */

/**
 * @typedef {Object} EditRequest
 * @property {string} explanation
 * @property {EditOperation[]} operations   Array → multi-op + multi-file edits later, no schema change.
 * @property {number} confidence            0..1, model self-rated (refined in Phase 8).
 */

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
})
