// agent/fileEditor.js
// In-memory undo: restore a file to a previously snapshotted content.
// (The string find/replace edit path was removed in Phase 6.9 — all edits now
// go through the AST pipeline in agent/ast/. Write-path safety rails live in
// agent/ast/safety.js.)

import fs from 'fs'
import path from 'path'

export function undoEdit({ absolutePath, previousContent }) {
  const resolvedPath = path.resolve(absolutePath)

  try {
    fs.writeFileSync(resolvedPath, previousContent, 'utf8')
    console.log(`Undid edit to ${path.basename(resolvedPath)}`)
    return { success: true }
  } catch (err) {
    console.log('[fileEditor] Undo error:', err.message)
    return {
      success: false,
      code: 'UNDO_ERROR',
      message: `Could not undo the change to ${path.basename(resolvedPath)}. Check that the file isn't read-only or open in another program.`,
    }
  }
}
