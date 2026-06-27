import { createPatch } from 'diff'

export function makeDiff(before: string, after: string, fileName: string): string {
  if (before === after) return ''
  return createPatch(fileName, before, after)
}
