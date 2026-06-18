// agent/ast/applyEdit.js
// The LLM-independent edit pipeline: resolve → confirm → mutate → syntax-guard →
// format → write → diff. The same entry point the LLM path (6.9) and the future
// drag-drop UI both call. Undo stays in the server (it keeps the returned snapshot).

import fs from 'fs'
import path from 'path'
import { getProject, getSourceFile } from './project.js'
import { resolveTarget } from './confirm.js'
import { applyOperation } from './operations/index.js'
import { checkWritePath, checkFileSize } from './safety.js'
import { formatEdited } from './format.js'
import { makeDiff } from './diff.js'

// Apply a batch of EditOperations (each carrying its own target) to one file.
// Returns { ok:true, absolutePath, filePath, diff, snapshot, formatted }
// or { ok:false, code, message }.
export async function applyEditOperations({ projectRoot, operations }) {
  if (!operations || operations.length === 0) {
    return { ok: false, code: 'NO_OPERATIONS', message: 'No operations to apply.' }
  }

  // Single-file for now (schema already allows multi-file later).
  const file = operations[0].target.file
  if (operations.some((op) => op.target.file !== file)) {
    return { ok: false, code: 'UNSUPPORTED_MULTIFILE', message: 'All operations must target the same file.' }
  }

  const absolutePath = path.resolve(projectRoot, file)
  const relativePath = path.relative(path.resolve(projectRoot), absolutePath).replace(/\\/g, '/')

  // ── Safety rails ──
  const pathCheck = checkWritePath({ absolutePath, projectRoot })
  if (!pathCheck.ok) return pathCheck
  const sizeCheck = checkFileSize(absolutePath)
  if (!sizeCheck.ok) return sizeCheck

  // ── Load (refreshed from disk) ──
  const sourceFile = getSourceFile(projectRoot, absolutePath)
  if (!sourceFile) {
    return { ok: false, code: 'FILE_NOT_FOUND', message: `Could not load ${relativePath}.` }
  }

  const project = getProject(projectRoot)

  // ── Pre-edit syntax guard ──
  if (project.getProgram().getSyntacticDiagnostics(sourceFile).length > 0) {
    return {
      ok: false,
      code: 'SYNTAX_ERROR_PREEXISTING',
      message: `${relativePath} has a syntax error before editing — fix it and try again.`,
    }
  }

  const snapshot = sourceFile.getFullText()

  // ── Apply each operation (re-resolve per op so prior drift is handled) ──
  for (const op of operations) {
    const resolved = resolveTarget(sourceFile, op.target)
    if (!resolved.ok) return resolved

    const result = applyOperation(resolved.node, op)
    if (!result.ok) return result
  }

  // ── Post-edit syntax guard (discard on failure, write nothing) ──
  if (project.getProgram().getSyntacticDiagnostics(sourceFile).length > 0) {
    return {
      ok: false,
      code: 'WOULD_BREAK_SYNTAX',
      message: 'This change would produce invalid code, so it was not applied.',
    }
  }

  // ── Format ──
  const formatted = await formatEdited(sourceFile, snapshot, absolutePath)

  // ── Write ──
  try {
    fs.writeFileSync(absolutePath, formatted, 'utf8')
  } catch (err) {
    return {
      ok: false,
      code: 'WRITE_ERROR',
      message: `Could not write to ${relativePath}. Check that the file isn't read-only or open elsewhere.`,
    }
  }

  return {
    ok: true,
    absolutePath,
    filePath: relativePath,
    diff: makeDiff(snapshot, formatted, relativePath),
    snapshot,
    formatted,
  }
}
