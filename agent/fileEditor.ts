import fs from 'fs'
import path from 'path'

type UndoResult =
  | { success: true }
  | { success: false; code: 'UNDO_ERROR'; message: string }

export function undoEdit({ absolutePath, previousContent }: { absolutePath: string; previousContent: string }): UndoResult {
  const resolvedPath = path.resolve(absolutePath)

  try {
    fs.writeFileSync(resolvedPath, previousContent, 'utf8')
    console.log(`Undid edit to ${path.basename(resolvedPath)}`)
    return { success: true }
  } catch (err) {
    console.log('[fileEditor] Undo error:', err instanceof Error ? err.message : String(err))
    return {
      success: false,
      code: 'UNDO_ERROR',
      message: `Could not undo the change to ${path.basename(resolvedPath)}. Check that the file isn't read-only or open in another program.`,
    }
  }
}
