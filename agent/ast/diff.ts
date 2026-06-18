// agent/ast/diff.ts
// Unified line-level diff between the pre-edit snapshot and the new content.
// Feeds the Phase 8 preview UI; returned on PREVIEW / EDIT_DONE.

import { createPatch } from 'diff'

export function makeDiff(before: string, after: string, fileName: string): string {
  if (before === after) return ''
  return createPatch(fileName, before, after)
}
