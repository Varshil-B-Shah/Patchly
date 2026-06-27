import fs from 'fs'
import path from 'path'
import type { OpResult } from './types.js'

const MAX_FILE_SIZE_BYTES = 500 * 1024

export const FORBIDDEN_PATHS: string[] = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'out',
]

export const FORBIDDEN_FILES: string[] = [
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

export function checkWritePath({ absolutePath, projectRoot }: { absolutePath: string; projectRoot: string }): OpResult {
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
export function checkFileSize(absolutePath: string): OpResult {
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
