import type {
  JsxElement,
  JsxSelfClosingElement,
  JsxOpeningElement,
  JsxAttributeLike,
} from 'ts-morph'
import type { ErrorCode } from '../../shared/protocol.js'

export type JsxNode = JsxElement | JsxSelfClosingElement

export type OpeningLike = JsxOpeningElement | JsxSelfClosingElement

export type OpResult =
  | { ok: true }
  | { ok: false; code: ErrorCode; message: string }

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

export interface NodeHandle {
  node: JsxNode
  openingTag: OpeningLike
  attributes: JsxAttributeLike[]
  kind: 'selfClosing' | 'element'
}

export interface ElementInfo {
  tagName: string
  attrs: Record<string, string>
  textSnippet: string
}
