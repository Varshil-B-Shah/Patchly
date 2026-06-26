import type { EditOperation } from './operations.js'
import type { ReviewComment } from './comments.js'

export const MSG = {
  // Extension -> Agent
  PING:         'PATCHLY_PING',
  EDIT_REQUEST: 'PATCHLY_EDIT_REQUEST',
  UNDO:         'PATCHLY_UNDO',

  // Agent -> Extension
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

  // Extension -> Agent
  CONFIRM:      'PATCHLY_CONFIRM',
  REJECT:       'PATCHLY_REJECT',

  // Direct class panel
  INSPECT:      'PATCHLY_INSPECT',
  ELEMENT_INFO: 'PATCHLY_ELEMENT_INFO',
  APPLY_OPS:    'PATCHLY_APPLY_OPS',
  OPS_APPLIED:  'PATCHLY_OPS_APPLIED',

  // MCP bridge
  SELECTION_UPDATE:    'PATCHLY_SELECTION_UPDATE',
  GET_SELECTION:       'PATCHLY_GET_SELECTION',
  SELECTION:           'PATCHLY_SELECTION',
  SCREENSHOT_REQUEST:  'PATCHLY_SCREENSHOT_REQUEST',
  SCREENSHOT_RESULT:   'PATCHLY_SCREENSHOT_RESULT',

  // Comment system
  ADD_COMMENT:      'PATCHLY_ADD_COMMENT',
  COMMENT_ADDED:    'PATCHLY_COMMENT_ADDED',
  LIST_COMMENTS:    'PATCHLY_LIST_COMMENTS',
  COMMENTS:         'PATCHLY_COMMENTS',
  RESOLVE_COMMENT:  'PATCHLY_RESOLVE_COMMENT',
  COMMENT_RESOLVED: 'PATCHLY_COMMENT_RESOLVED',
  DELETE_COMMENT:   'PATCHLY_DELETE_COMMENT',
  COMMENT_DELETED:  'PATCHLY_COMMENT_DELETED',
  CLEAR_COMMENTS: 'PATCHLY_CLEAR_COMMENTS',
  COMMENTS_CLEARED: 'PATCHLY_COMMENTS_CLEARED',
  ADD_REPLY:       'PATCHLY_ADD_REPLY',
  REPLY_ADDED:     'PATCHLY_REPLY_ADDED',
} as const

export type MsgType = (typeof MSG)[keyof typeof MSG]

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

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

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
  elementTag?: string
  prompt: string
  sessionId: string
  screenshot_base64?: string | null
  targets?: EditRequestTarget[]
}

export interface ProgressMessage {
  type: typeof MSG.PROGRESS
  sessionId: string
  stage: 'analyzing' | 'generating' | 'building'
  text?: string
}

export interface PreviewMessage {
  type: typeof MSG.PREVIEW
  sessionId: string
  explanation: string
  confidence: number
  diff: string
  filePath: string
  lineNumber: number
}

export interface BatchEditEntry {
  ok: boolean
  filePath?: string
  lineNumber?: number
  explanation?: string
  confidence?: number
  diff?: string
  targetCount?: number
  code?: ErrorCode | string
  message?: string
}

export interface PreviewBatchMessage {
  type: typeof MSG.PREVIEW_BATCH
  sessionId: string
  edits: BatchEditEntry[]
}

export interface RedirectSuggestion {
  file: string
  reason: string
}

export interface RedirectMessage {
  type: typeof MSG.REDIRECT
  sessionId: string
  prompt: string
  suggestions: RedirectSuggestion[]
}

export interface EditDoneMessage {
  type: typeof MSG.EDIT_DONE
  sessionId: string
  editId: string
  filePath: string
  lineNumber: number
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

export interface ThemeColor {
  name: string
  value: string
}

export interface ThemeTokens {
  colors: ThemeColor[]
}

export interface StatusMessage {
  type: typeof MSG.STATUS
  connected: boolean
  projectRoot: string
  theme?: ThemeTokens
  tailwindConfigured?: boolean
}

export interface InspectMessage {
  type: typeof MSG.INSPECT
  sessionId: string
  patchlySources: string[]
}

export interface ClassInfo {
  patchlySrc: string
  tagName: string
  classNameKind: 'static' | 'dynamic' | 'none'
  classes: string[]
  dynamicText?: string
  filePath: string
  lineNumber: number
  column: number
}

export interface ElementInfoMessage {
  type: typeof MSG.ELEMENT_INFO
  sessionId: string
  elements: ClassInfo[]
}

/** Apply pre-built operations directly (no LLM, no preview) — the direct panel path.
 *  When dryRun is true the agent runs the full pipeline (drift/syntax/format) but
 *  skips the disk write and replies with OPS_APPLIED carrying the unified diff. */
export interface ApplyOpsMessage {
  type: typeof MSG.APPLY_OPS
  sessionId: string
  operations: EditOperation[]
  explanation: string
  dryRun?: boolean
  confirmed?: boolean
}

export interface OpsAppliedMessage {
  type: typeof MSG.OPS_APPLIED
  sessionId: string
  ok: true
  diff: string
  requiresConfirmation?: boolean
}

export interface ReactInfo {
  componentName: string | null
  props: Record<string, unknown>
}

export interface SelectionItem {
  patchlySrc: string
  tag: string
  classes: string
  computedStyles?: Record<string, string>
  screenshot?: string | null
  reactInfo?: ReactInfo | null
}

// Extension -> agent
export interface SelectionUpdateMessage {
  type: typeof MSG.SELECTION_UPDATE
  selection: SelectionItem[]
}

// MCP -> agent
export interface GetSelectionMessage {
  type: typeof MSG.GET_SELECTION
  sessionId: string
  selectionId?: string
}

// Agent -> MCP
export interface SelectionMessage {
  type: typeof MSG.SELECTION
  sessionId: string
  selectionId?: string
  stale?: boolean
  selection: SelectionItem[]
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

export interface UndoMessage {
  type: typeof MSG.UNDO
  editId?: string
}

export interface UndoDoneMessage {
  type: typeof MSG.UNDO_DONE
  editId: string
}

export interface ScreenshotRequestMessage {
  type: typeof MSG.SCREENSHOT_REQUEST
  sessionId: string
  patchlySrc?: string
}

/** Extension → agent → MCP: the capture result. */
export interface ScreenshotResultMessage {
  type: typeof MSG.SCREENSHOT_RESULT
  sessionId: string
  screenshot: string | null
  patchlySrc?: string
}

// Comment system 

export interface AddCommentMessage {
  type: typeof MSG.ADD_COMMENT
  comment: Omit<ReviewComment, 'id' | 'createdAt' | 'status'>
}

export interface CommentAddedMessage {
  type: typeof MSG.COMMENT_ADDED
  comment: ReviewComment
}

export interface ListCommentsMessage {
  type: typeof MSG.LIST_COMMENTS
  sessionId: string
  status?: 'open' | 'resolved' | 'all'
}

export interface CommentsMessage {
  type: typeof MSG.COMMENTS
  sessionId: string
  comments: ReviewComment[]
}

export interface ResolveCommentMessage {
  type: typeof MSG.RESOLVE_COMMENT
  sessionId?: string
  id: string
  resolvedBy?: 'dev' | 'agent'
}

export interface CommentResolvedMessage {
  type: typeof MSG.COMMENT_RESOLVED
  sessionId?: string
  id: string
  comment: ReviewComment
}

export interface DeleteCommentMessage {
  type: typeof MSG.DELETE_COMMENT
  id: string
}

export interface CommentDeletedMessage {
  type: typeof MSG.COMMENT_DELETED
  id: string
}

// MCP -> Agent
export interface ClearCommentsMessage {
  type: typeof MSG.CLEAR_COMMENTS
  sessionId?: string
}
// Agent → Extension (broadcast) + MCP (unicast)
export interface CommentsClearedMessage {
  type: typeof MSG.COMMENTS_CLEARED
  sessionId?: string
  count: number
}

// Extension → Agent
export interface AddReplyMessage {
  type: typeof MSG.ADD_REPLY
  commentId: string
  note: string
}

// Agent → Extension (broadcast)
export interface ReplyAddedMessage {
  type: typeof MSG.REPLY_ADDED
  comment: import('./comments.js').ReviewComment
}

export type ExtensionToAgentMessage =
  | PingMessage
  | EditRequestMessage
  | ConfirmMessage
  | RejectMessage
  | UndoMessage
  | InspectMessage
  | ApplyOpsMessage
  | SelectionUpdateMessage
  | GetSelectionMessage
  | ScreenshotResultMessage
  | AddCommentMessage
  | ListCommentsMessage
  | ResolveCommentMessage
  | DeleteCommentMessage
  | ClearCommentsMessage
  | AddReplyMessage

// Any message the agent sends back to a client (extension or MCP bridge)
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
  | OpsAppliedMessage
  | SelectionMessage
  | ScreenshotRequestMessage
  | CommentAddedMessage
  | CommentsMessage
  | CommentResolvedMessage
  | CommentDeletedMessage
  | CommentsClearedMessage
  | ReplyAddedMessage
