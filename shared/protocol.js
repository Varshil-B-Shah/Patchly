// shared/protocol.js
// Message types for extension ↔ agent communication
// Both sides must use these exact strings — no magic strings elsewhere

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
  PREVIEW:      'PATCHLY_PREVIEW',
  PREVIEW_BATCH:'PATCHLY_PREVIEW_BATCH',
  UNDO_DONE:    'PATCHLY_UNDO_DONE',
  INFO:         'PATCHLY_INFO',

  // Extension → Agent (Phase 4+)
  CONFIRM:      'PATCHLY_CONFIRM',
  REJECT:       'PATCHLY_REJECT',
}

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
})

// Message shape reference (not enforced in v1, just documentation)
// EDIT_REQUEST payload:
// {
//   type: MSG.EDIT_REQUEST,
//   patchlySrc: string,             // "src/components/Hero.jsx:5:4"
//   elementHtml: string,            // outerHTML of selected element (max 500 chars)
//   elementClasses: string,         // className string
//   prompt: string,                 // user's natural language instruction
//   sessionId: string,              // random ID for this edit session
//   screenshot_base64?: string,     // base64 PNG of the cropped element (Phase 7); null if capture failed
//   targets?: [{                    // MULTI-SELECT (fan-out). When present (len>1), batch mode.
//     patchlySrc, elementHtml, elementClasses, screenshot_base64?
//   }],                             // `prompt` is shared across all targets.
// }

// PREVIEW_BATCH payload (Agent → Extension): one entry per selected target.
// {
//   type: MSG.PREVIEW_BATCH,
//   sessionId: string,
//   edits: [{
//     ok: boolean,
//     filePath?: string, lineNumber?: number, explanation?: string,
//     confidence?: number, diff?: string,   // present when ok
//     code?: string, message?: string,      // present when !ok
//   }],
// }

// PROGRESS payload (Agent → Extension): live status while an edit is being prepared.
// {
//   type: MSG.PROGRESS,
//   sessionId: string,
//   stage: 'analyzing' | 'generating' | 'building',
//   text?: string,             // streamed explanation (during 'generating'), if available
// }

// PREVIEW payload:
// {
//   type: MSG.PREVIEW,
//   sessionId: string,
//   explanation: string,       // one sentence from LLM
//   confidence: number,        // 0..1, model self-rated
//   diff: string,              // unified diff of the pending edit
//   filePath: string,          // relative path of target file
//   lineNumber: number,
// }

// EDIT_DONE payload:
// {
//   type: MSG.EDIT_DONE,
//   sessionId: string,
//   editId: string,            // id for this applied edit (used by per-edit undo + history)
//   filePath: string,          // relative path of edited file
//   lineNumber: number,
//   explanation: string,       // one-sentence summary, shown in the history sidebar
// }

// UNDO payload (Extension → Agent):
// {
//   type: MSG.UNDO,
//   editId?: string,           // undo this specific edit; if omitted, undo the most recent
// }

// UNDO_DONE payload:
// {
//   type: MSG.UNDO_DONE,
//   editId: string,            // the edit that was reverted
// }

// EDIT_ERROR payload:
// {
//   type: MSG.EDIT_ERROR,
//   sessionId: string,
//   code: string,              // one of ERROR_CODES
//   message: string,           // human readable
// }
