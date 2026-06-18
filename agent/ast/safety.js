// agent/ast/safety.js
// Reusable write-path safety rails for the AST editing pipeline. Ported from the
// inline checks in agent/fileEditor.js so the new pipeline (and, after the 6.9
// cutover, the server) share one canonical set of rails.

import fs from 'fs'
import path from 'path'

const MAX_FILE_SIZE_BYTES = 500 * 1024

// Directories that must never be written to.
export const FORBIDDEN_PATHS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'out',
]

// Files that must never be written to.
export const FORBIDDEN_FILES = [
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

// Validate that absolutePath is a safe target to write to inside projectRoot.
// Returns { ok: true } or { ok: false, code, message }.
export function checkWritePath({ absolutePath, projectRoot }) {
  const resolvedPath = path.resolve(absolutePath)
  const resolvedRoot = path.resolve(projectRoot)

  // 1. Must be inside projectRoot.
  if (!resolvedPath.startsWith(resolvedRoot)) {
    return { ok: false, code: 'PATH_TRAVERSAL', message: 'Refusing to write outside project root.' }
  }

  // 2. No forbidden directories.
  const relativePath = path.relative(resolvedRoot, resolvedPath)
  for (const forbidden of FORBIDDEN_PATHS) {
    if (
      relativePath.startsWith(forbidden + path.sep) ||
      relativePath.includes(path.sep + forbidden + path.sep)
    ) {
      return { ok: false, code: 'FORBIDDEN_PATH', message: `Refusing to write to ${forbidden}/` }
    }
  }

  // 3. No forbidden files.
  const fileName = path.basename(resolvedPath)
  if (FORBIDDEN_FILES.includes(fileName)) {
    return { ok: false, code: 'FORBIDDEN_FILE', message: `Refusing to write to ${fileName}` }
  }

  // 4. File must exist.
  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      code: 'FILE_NOT_FOUND',
      message: `Could not find ${relativePath}. The file may have been moved, renamed, or deleted.`,
    }
  }

  return { ok: true }
}

// Validate the file is not too large to safely edit.
export function checkFileSize(absolutePath) {
  const stats = fs.statSync(path.resolve(absolutePath))
  if (stats.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      message: `File too large (${Math.round(stats.size / 1024)}KB). Max is 500KB.`,
    }
  }
  return { ok: true }
}
