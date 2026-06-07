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
  PREVIEW:      'PATCHLY_PREVIEW',
  UNDO_DONE:    'PATCHLY_UNDO_DONE',
  INFO:         'PATCHLY_INFO',

  // Extension → Agent (Phase 4+)
  CONFIRM:      'PATCHLY_CONFIRM',
  REJECT:       'PATCHLY_REJECT',
}

// Message shape reference (not enforced in v1, just documentation)
// EDIT_REQUEST payload:
// {
//   type: MSG.EDIT_REQUEST,
//   patchlySrc: string,        // "src/components/Hero.jsx:5:4"
//   elementHtml: string,       // outerHTML of selected element (max 500 chars)
//   elementClasses: string,    // className string
//   prompt: string,            // user's natural language instruction
//   sessionId: string,         // random ID for this edit session
// }

// EDIT_DONE payload:
// {
//   type: MSG.EDIT_DONE,
//   sessionId: string,
//   find: string,              // what was replaced
//   replace: string,           // what it was replaced with
//   filePath: string,          // absolute path of edited file
//   explanation: string,       // one sentence from LLM
// }

// EDIT_ERROR payload:
// {
//   type: MSG.EDIT_ERROR,
//   sessionId: string,
//   code: string,              // 'SOURCE_NOT_FOUND' | 'LLM_FAILED' | 'FILE_WRITE_FAILED' | 'AMBIGUOUS_MATCH'
//   message: string,           // human readable
// }
