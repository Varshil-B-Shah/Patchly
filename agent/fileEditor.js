// agent/fileEditor.js
// Applies a find+replace edit to a source file with safety checks
// Undo history is kept in memory by the caller (server.js) — no backup files on disk

import fs from 'fs'
import path from 'path'

// Directories that must never be written to
const FORBIDDEN_PATHS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'out',
]

// Files that must never be written to
const FORBIDDEN_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'vite.config.js',
  'vite.config.ts',
  'next.config.js',
  'next.config.ts',
]

export function applyEdit({ absolutePath, find, replace, projectRoot }) {
  // ── Safety checks ──

  // 1. Path must be inside projectRoot
  const resolvedPath = path.resolve(absolutePath)
  const resolvedRoot = path.resolve(projectRoot)
  if (!resolvedPath.startsWith(resolvedRoot)) {
    return {
      success: false,
      code: 'PATH_TRAVERSAL',
      message: 'Refusing to write outside project root.'
    }
  }

  // 2. No forbidden directories
  const relativePath = path.relative(resolvedRoot, resolvedPath)
  for (const forbidden of FORBIDDEN_PATHS) {
    if (relativePath.startsWith(forbidden + path.sep) || relativePath.includes(path.sep + forbidden + path.sep)) {
      return {
        success: false,
        code: 'FORBIDDEN_PATH',
        message: `Refusing to write to ${forbidden}/`
      }
    }
  }

  // 3. No forbidden files
  const fileName = path.basename(resolvedPath)
  if (FORBIDDEN_FILES.includes(fileName)) {
    return {
      success: false,
      code: 'FORBIDDEN_FILE',
      message: `Refusing to write to ${fileName}`
    }
  }

  // 4. File must exist
  if (!fs.existsSync(resolvedPath)) {
    console.log('[fileEditor] File not found:', resolvedPath)
    return {
      success: false,
      code: 'FILE_NOT_FOUND',
      message: `Could not find ${relativePath}. The file may have been moved, renamed, or deleted.`
    }
  }

  // ── Read current content ──
  let content
  try {
    content = fs.readFileSync(resolvedPath, 'utf8')
  } catch (err) {
    console.log('[fileEditor] Read error:', err.message)
    return {
      success: false,
      code: 'READ_ERROR',
      message: `Could not read ${relativePath}. It may have been moved or deleted.`
    }
  }

  // ── Validate find string ──
  const occurrences = content.split(find).length - 1

  if (occurrences === 0) {
    return {
      success: false,
      code: 'NOT_FOUND',
      message: `The target string was not found in the file. The code may have changed since the edit was generated. Please try again.`
    }
  }

  if (occurrences > 1) {
    return {
      success: false,
      code: 'AMBIGUOUS_MATCH',
      message: `The target string appears ${occurrences} times in the file. Cannot safely apply. Please select a more specific element.`
    }
  }

  // ── Apply edit ──
  const newContent = content.replace(find, replace)

  try {
    fs.writeFileSync(resolvedPath, newContent, 'utf8')
  } catch (err) {
    console.log('[fileEditor] Write error:', err.message)
    return {
      success: false,
      code: 'WRITE_ERROR',
      message: `Could not write to ${relativePath}. Check that the file isn't read-only or open in another program.`
    }
  }

  console.log(`Applied edit to ${relativePath}`)

  return {
    success: true,
    absolutePath: resolvedPath,
    previousContent: content,
  }
}

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
      message: `Could not undo the change to ${path.basename(resolvedPath)}. Check that the file isn't read-only or open in another program.`
    }
  }
}
