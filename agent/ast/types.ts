// agent/ast/types.ts
// Shared result/handle types for the AST editing engine. Kept tiny and
// LLM-independent — these describe the engine's own contracts, not the LLM path.

import type {
  JsxElement,
  JsxSelfClosingElement,
  JsxOpeningElement,
  JsxAttributeLike,
} from 'ts-morph'
import type { ErrorCode } from '../../shared/protocol.js'

/** A resolved JSX target node (either form). */
export type JsxNode = JsxElement | JsxSelfClosingElement

/** The opening tag of a JSX element, or the self-closing element itself. */
export type OpeningLike = JsxOpeningElement | JsxSelfClosingElement

/** Result of a single operation executor (and the internal safety checks). */
export type OpResult =
  | { ok: true }
  | { ok: false; code: ErrorCode; message: string }

/** Result of the full applyEditOperations pipeline. */
export type ApplyResult =
  | {
      ok: true
      absolutePath: string
      filePath: string
      diff: string
      snapshot: string
      formatted: string
      code?: undefined
      message?: undefined
    }
  | { ok: false; code: ErrorCode; message: string }

/** A normalized pointer to a located JSX node and its opening tag. */
export interface NodeHandle {
  node: JsxNode
  openingTag: OpeningLike
  attributes: JsxAttributeLike[]
  kind: 'selfClosing' | 'element'
}

/** Fingerprint info read from a node: tag, static string attrs, text prefix. */
export interface ElementInfo {
  tagName: string
  attrs: Record<string, string>
  textSnippet: string
}
