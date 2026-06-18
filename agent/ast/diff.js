// agent/ast/diff.js
// Unified line-level diff between the pre-edit snapshot and the new content.
// Feeds the Phase 8 preview UI; returned on PREVIEW / EDIT_DONE.

import { createPatch } from 'diff'

export function makeDiff(before, after, fileName) {
  if (before === after) return ''
  return createPatch(fileName, before, after)
}
