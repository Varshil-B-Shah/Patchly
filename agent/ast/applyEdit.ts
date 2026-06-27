import fs from 'fs'
import path from 'path'
import { getProject, getSourceFile } from './project.js'
import { resolveTarget } from './confirm.js'
import { applyOperation } from './operations/index.js'
import { checkWritePath, checkFileSize } from './safety.js'
import { formatEdited } from './format.js'
import { makeDiff } from './diff.js'
import type { ApplyResult } from './types.js'
import type { EditOperation } from '../../shared/operations.js'

export async function applyEditOperations({
  projectRoot,
  operations,
  dryRun = false,
}: {
  projectRoot: string
  operations: EditOperation[]
  dryRun?: boolean
}): Promise<ApplyResult> {
  if (!operations || operations.length === 0) {
    return { ok: false, code: 'NO_OPERATIONS', message: 'No operations to apply.' }
  }

  const file = operations[0].target.file
  if (operations.some((op) => op.target.file !== file)) {
    return { ok: false, code: 'UNSUPPORTED_MULTIFILE', message: 'All operations must target the same file.' }
  }

  const absolutePath = path.resolve(projectRoot, file)
  const relativePath = path.relative(path.resolve(projectRoot), absolutePath).replace(/\\/g, '/')

  // Safety rails
  const pathCheck = checkWritePath({ absolutePath, projectRoot })
  if (!pathCheck.ok) return pathCheck
  const sizeCheck = checkFileSize(absolutePath)
  if (!sizeCheck.ok) return sizeCheck

  const sourceFile = getSourceFile(projectRoot, absolutePath)
  if (!sourceFile) {
    return { ok: false, code: 'FILE_NOT_FOUND', message: `Could not load ${relativePath}.` }
  }

  const project = getProject(projectRoot)

  const diskText = fs.readFileSync(absolutePath, 'utf8')
  if (sourceFile.getFullText() !== diskText) sourceFile.replaceWithText(diskText)

  if (project.getProgram().getSyntacticDiagnostics(sourceFile).length > 0) {
    return {
      ok: false,
      code: 'SYNTAX_ERROR_PREEXISTING',
      message: `${relativePath} has a syntax error before editing — fix it and try again.`,
    }
  }

  const snapshot = diskText

  const resolvedOps: { node: import('./types.js').JsxNode; op: EditOperation }[] = []
  for (const op of operations) {
    const resolved = resolveTarget(sourceFile, op.target)
    if (!resolved.ok) return resolved
    resolvedOps.push({ node: resolved.node, op })
  }

  for (const { node, op } of resolvedOps) {
    const result = applyOperation(node, op, project)
    if (!result.ok) return result
  }

  if (project.getProgram().getSyntacticDiagnostics(sourceFile).length > 0) {
    return {
      ok: false,
      code: 'WOULD_BREAK_SYNTAX',
      message: 'This change would produce invalid code, so it was not applied.',
    }
  }

  let formatted = await formatEdited(sourceFile, snapshot, absolutePath)

  const eol = snapshot.includes('\r\n') ? '\r\n' : '\n'
  formatted = formatted.replace(/\r\n/g, '\n')
  if (eol === '\r\n') formatted = formatted.replace(/\n/g, '\r\n')

  if (!dryRun) {
    try {
      fs.writeFileSync(absolutePath, formatted, 'utf8')
    } catch {
      return {
        ok: false,
        code: 'WRITE_ERROR',
        message: `Could not write to ${relativePath}. Check that the file isn't read-only or open elsewhere.`,
      }
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
