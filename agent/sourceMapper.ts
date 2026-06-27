import fs from 'fs'
import path from 'path'
import type { ErrorCode } from '../shared/protocol.js'

const MAX_FILE_SIZE_BYTES = 500 * 1024

export interface ResolvedSource {
  success: true
  absolutePath: string
  relativePath: string
  lineNumber: number
  colNumber: number
  targetLine: string
  contextLines: string
  fullContent: string
  totalLines: number
}

export interface SourceFailure {
  success: false
  code: ErrorCode
  message: string
}

export type SourceResult = ResolvedSource | SourceFailure

export function resolveSource(patchlySrc: string | null | undefined, projectRoot: string): SourceResult {
  if (!patchlySrc) {
    return {
      success: false,
      code: 'NO_SOURCE_ATTR',
      message: 'Element has no data-patchly-src attribute. Make sure patchlyPlugin() is in your vite.config.js and the dev server was restarted.',
    }
  }

  const parts = patchlySrc.split(':')
  if (parts.length < 2) {
    return {
      success: false,
      code: 'INVALID_SRC_FORMAT',
      message: `Invalid patchlySrc format: ${patchlySrc}`,
    }
  }

  const filePath = parts[0]
  const lineNumber = parseInt(parts[1], 10)
  const colNumber = parseInt(parts[2] || '0', 10)

  const absolutePath = path.resolve(projectRoot, filePath)

  if (!absolutePath.startsWith(path.resolve(projectRoot))) {
    return {
      success: false,
      code: 'PATH_TRAVERSAL',
      message: 'Resolved path is outside project root. Refusing to read.',
    }
  }

  if (!fs.existsSync(absolutePath)) {
    console.log('[sourceMapper] File not found:', absolutePath)
    return {
      success: false,
      code: 'FILE_NOT_FOUND',
      message: `Could not find ${filePath}. The file may have been moved, renamed, or deleted.`,
    }
  }

  const stats = fs.statSync(absolutePath)
  if (stats.size > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      code: 'FILE_TOO_LARGE',
      message: `File too large (${Math.round(stats.size / 1024)}KB). Max is 500KB.`,
    }
  }

  const content = fs.readFileSync(absolutePath, 'utf8')
  const lines = content.split('\n')

  if (lineNumber < 1 || lineNumber > lines.length) {
    return {
      success: false,
      code: 'LINE_OUT_OF_RANGE',
      message: `Line ${lineNumber} is out of range (file has ${lines.length} lines)`,
    }
  }

  const contextStart = Math.max(0, lineNumber - 5)
  const contextEnd = Math.min(lines.length - 1, lineNumber + 4)
  const contextLines = lines.slice(contextStart, contextEnd + 1).join('\n')

  return {
    success: true,
    absolutePath,
    relativePath: filePath,
    lineNumber,
    colNumber,
    targetLine: lines[lineNumber - 1],
    contextLines,
    fullContent: content,
    totalLines: lines.length,
  }
}
