// shared/protocol.ts
// Message types for extension ↔ agent communication
// Both sides must use these exact strings — no magic strings elsewhere

import type { EditOperation } from './operations.js'

export const MSG = {
  // Extension → Agent
  PING:         'PATCHLY_PING',
  EDIT_REQUEST: 'PATCHLY_EDIT_REQUEST',
  UNDO:         'PATCHLY_UNDO',

  // Agent → Extension
  PONG:         'PATCHLY_PONG',
  EDIT_DONE:    'PATCHLY_EDIT_DONE',
  EDIT_ERROR:   'PATCHLY_EDIT_ERROR',
  STATUS:       'PATCHLY_STATUS',
  PROGRESS:     'PATCHLY_PROGRESS',
  REDIRECT:     'PATCHLY_REDIRECT',
  PREVIEW:      'PATCHLY_PREVIEW',
  PREVIEW_BATCH:'PATCHLY_PREVIEW_BATCH',
  UNDO_DONE:    'PATCHLY_UNDO_DONE',
  INFO:         'PATCHLY_INFO',

  // Extension → Agent (Phase 4+)
  CONFIRM:      'PATCHLY_CONFIRM',
  REJECT:       'PATCHLY_REJECT',

  // Direct class panel (LLM-free direct manipulation)
  INSPECT:      'PATCHLY_INSPECT',       // ext → agent: read an element's source className
  ELEMENT_INFO: 'PATCHLY_ELEMENT_INFO',  // agent → ext: the className breakdown
  APPLY_OPS:    'PATCHLY_APPLY_OPS',     // ext → agent: apply pre-built operations, no LLM
} as const

/** Union of all message-type string literals, e.g. "PATCHLY_PREVIEW". */
export type MsgType = (typeof MSG)[keyof typeof MSG]

// Canonical registry of error codes carried on EDIT_ERROR.code. Single source of
// truth — the AMBIGUOUS_MATCH / NOT_FOUND codes from the old string find/replace
// path are retired as of Phase 6.9.
export const ERROR_CODES = Object.freeze({
  // Source mapping (sourceMapper.js)
  NO_SOURCE_ATTR:           'NO_SOURCE_ATTR',
  INVALID_SRC_FORMAT:       'INVALID_SRC_FORMAT',
  LINE_OUT_OF_RANGE:        'LINE_OUT_OF_RANGE',

  // Target resolution / drift guard (ast/confirm.js)
  TARGET_DRIFTED:           'TARGET_DRIFTED',

  // Operation executors (ast/operations/)
  DYNAMIC_CLASSNAME:        'DYNAMIC_CLASSNAME',
  DYNAMIC_STYLE:            'DYNAMIC_STYLE',
  MIXED_CHILDREN:           'MIXED_CHILDREN',
  INVALID_JSX:              'INVALID_JSX',
  UNSUPPORTED_TARGET:       'UNSUPPORTED_TARGET',
  UNKNOWN_OP:               'UNKNOWN_OP',

  // Edit pipeline / syntax guards (ast/applyEdit.js)
  NO_OPERATIONS:            'NO_OPERATIONS',
  UNSUPPORTED_MULTIFILE:    'UNSUPPORTED_MULTIFILE',
  SYNTAX_ERROR_PREEXISTING: 'SYNTAX_ERROR_PREEXISTING',
  WOULD_BREAK_SYNTAX:       'WOULD_BREAK_SYNTAX',

  // Write-path safety rails (ast/safety.js)
  PATH_TRAVERSAL:           'PATH_TRAVERSAL',
  FORBIDDEN_PATH:           'FORBIDDEN_PATH',
  FORBIDDEN_FILE:           'FORBIDDEN_FILE',
  FILE_NOT_FOUND:           'FILE_NOT_FOUND',
  FILE_TOO_LARGE:           'FILE_TOO_LARGE',
  WRITE_ERROR:              'WRITE_ERROR',

  // LLM (llm.js)
  NO_CREDENTIALS:           'NO_CREDENTIALS',
  LLM_API_ERROR:            'LLM_API_ERROR',
  LLM_TIMEOUT:              'LLM_TIMEOUT',
  NETWORK_ERROR:            'NETWORK_ERROR',
  EMPTY_RESPONSE:           'EMPTY_RESPONSE',
  JSON_PARSE_FAILED:        'JSON_PARSE_FAILED',
  LLM_BAD_OUTPUT:           'LLM_BAD_OUTPUT',
  LLM_CANNOT_EDIT:          'LLM_CANNOT_EDIT',

  // Session / undo (server.js)
  NO_PENDING_EDIT:          'NO_PENDING_EDIT',
  NOTHING_TO_UNDO:          'NOTHING_TO_UNDO',
  UNDO_ERROR:               'UNDO_ERROR',
} as const)

/** Union of all error-code string literals, e.g. "TARGET_DRIFTED". */
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

// ─── Message payload shapes ───────────────────────────────────────────────────
// Previously documented only as comments; now real types consumed by the agent
// (and, after bundling, by the extension).

/** One target in a multi-select (fan-out) EDIT_REQUEST. */
export interface EditRequestTarget {
  patchlySrc: string
  elementHtml: string
  elementClasses: string
  screenshot_base64?: string | null
}

export interface EditRequestMessage {
  type: typeof MSG.EDIT_REQUEST
  patchlySrc: string
  elementHtml: string
  elementClasses: string
  /** Lowercase tag name of the selected element (single-edit path). */
  elementTag?: string
  /** User's natural language instruction. */
  prompt: string
  /** Random ID for this edit session. */
  sessionId: string
  /** base64 PNG of the cropped element (Phase 7); null/undefined if capture failed. */
  screenshot_base64?: string | null
  /** MULTI-SELECT (fan-out). When present (len>1), batch mode. `prompt` is shared. */
  targets?: EditRequestTarget[]
}

/** Live status while an edit is being prepared. */
export interface ProgressMessage {
  type: typeof MSG.PROGRESS
  sessionId: string
  stage: 'analyzing' | 'generating' | 'building'
  /** Streamed explanation (during 'generating'), if available. */
  text?: string
}

/** Preview of a single pending edit (dry run). */
export interface PreviewMessage {
  type: typeof MSG.PREVIEW
  sessionId: string
  /** One sentence from the LLM. */
  explanation: string
  /** 0..1, model self-rated. */
  confidence: number
  /** Unified diff of the pending edit. */
  diff: string
  /** Relative path of target file. */
  filePath: string
  lineNumber: number
}

/** One file's entry in a batch preview. */
export interface BatchEditEntry {
  ok: boolean
  filePath?: string
  lineNumber?: number
  explanation?: string
  /** Present when ok. */
  confidence?: number
  /** Present when ok. */
  diff?: string
  /** Number of selected targets that resolved to this file. */
  targetCount?: number
  /** Present when !ok. */
  code?: ErrorCode | string
  /** Present when !ok. */
  message?: string
}

export interface PreviewBatchMessage {
  type: typeof MSG.PREVIEW_BATCH
  sessionId: string
  edits: BatchEditEntry[]
}

/** A child component the change should be redirected to. */
export interface RedirectSuggestion {
  file: string
  reason: string
}

export interface RedirectMessage {
  type: typeof MSG.REDIRECT
  sessionId: string
  /** The original instruction, to replay against the chosen child. */
  prompt: string
  suggestions: RedirectSuggestion[]
}

export interface EditDoneMessage {
  type: typeof MSG.EDIT_DONE
  sessionId: string
  /** ID for this applied edit (used by per-edit undo + history). */
  editId: string
  /** Relative path of edited file. */
  filePath: string
  lineNumber: number
  /** One-sentence summary, shown in the history sidebar. */
  explanation: string
}

export interface EditErrorMessage {
  type: typeof MSG.EDIT_ERROR
  sessionId?: string
  code: ErrorCode | string
  message: string
}

export interface InfoMessage {
  type: typeof MSG.INFO
  sessionId: string
  message: string
}

/** One color token from the project's Tailwind theme, for panel swatches. */
export interface ThemeColor {
  /** Tailwind name fragment, e.g. "brand" or "brand-light". */
  name: string
  /** CSS color value, e.g. "#6366f1". */
  value: string
}

/** Structured design tokens the class panel renders (distinct from the LLM's string summary). */
export interface ThemeTokens {
  colors: ThemeColor[]
}

export interface StatusMessage {
  type: typeof MSG.STATUS
  connected: boolean
  projectRoot: string
  /** Project Tailwind theme tokens for the class panel (sent once on connect). */
  theme?: ThemeTokens
}

/** Ask the agent to read an element's className straight from source. */
export interface InspectMessage {
  type: typeof MSG.INSPECT
  sessionId: string
  patchlySrc: string
}

/** The source-accurate className breakdown for the class panel. */
export interface ElementInfoMessage {
  type: typeof MSG.ELEMENT_INFO
  sessionId: string
  tagName: string
  /** 'static' = editable string literal; 'dynamic' = clsx/ternary/etc (locked); 'none' = no className attr. */
  classNameKind: 'static' | 'dynamic' | 'none'
  /** The class tokens (empty for 'none'; for 'dynamic' these come from the live DOM, display-only). */
  classes: string[]
  /** Short snippet of the dynamic expression, shown on the locked chip. */
  dynamicText?: string
  filePath: string
  lineNumber: number
  column: number
}

/** Apply pre-built operations directly (no LLM, no preview) — the direct panel path. */
export interface ApplyOpsMessage {
  type: typeof MSG.APPLY_OPS
  sessionId: string
  operations: EditOperation[]
  /** One-sentence summary for the history sidebar, e.g. "Set classes on <button>". */
  explanation: string
}

export interface PongMessage {
  type: typeof MSG.PONG
}

export interface PingMessage {
  type: typeof MSG.PING
}

export interface ConfirmMessage {
  type: typeof MSG.CONFIRM
  sessionId: string
}

export interface RejectMessage {
  type: typeof MSG.REJECT
  sessionId: string
}

/** Undo a specific edit; if editId omitted, undo the most recent. */
export interface UndoMessage {
  type: typeof MSG.UNDO
  editId?: string
}

export interface UndoDoneMessage {
  type: typeof MSG.UNDO_DONE
  /** The edit that was reverted. */
  editId: string
}

/** Any message the extension sends to the agent. */
export type ExtensionToAgentMessage =
  | PingMessage
  | EditRequestMessage
  | ConfirmMessage
  | RejectMessage
  | UndoMessage
  | InspectMessage
  | ApplyOpsMessage

/** Any message the agent sends to the extension. */
export type AgentToExtensionMessage =
  | PongMessage
  | StatusMessage
  | ProgressMessage
  | PreviewMessage
  | PreviewBatchMessage
  | RedirectMessage
  | EditDoneMessage
  | EditErrorMessage
  | InfoMessage
  | UndoDoneMessage
  | ElementInfoMessage
