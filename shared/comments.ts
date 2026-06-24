// shared/comments.ts
// Browser-safe: no Node.js imports. Imported by extension bundle and agent both.

export interface ReviewComment {
  id: string
  kind: 'element' | 'area'
  // kind === 'element'
  patchlySrc?: string           // "src/components/Hero.tsx:42:4"
  tag?: string
  componentName?: string | null
  fingerprint?: {
    tagName: string
    identifyingAttrs?: Record<string, string>
    textSnippet?: string
  }
  // kind === 'area'
  rect?: { x: number; y: number; w: number; h: number }
  pageUrl: string
  note: string                  // UNTRUSTED reviewer text
  author?: string
  /**
   * Phase A (local store): base64 PNG string.
   * Phase B (cloud):       { url: UploadThing CDN URL, key: UploadThing file key }.
   * Both shapes coexist — consumers must check `typeof screenshot`.
   */
  screenshot?: string | { url: string; key: string }
  status: 'open' | 'resolved'
  createdAt: string             // ISO 8601
  resolvedAt?: string
  resolvedBy?: 'dev' | 'agent'
}

/** Parse a data-patchly-src string into its components. Returns null on bad format. */
export function parsePatchlySrc(src: string): { file: string; line: number; column: number } | null {
  const m = src.match(/^(.+):(\d+):(\d+)$/)
  if (!m) return null
  const line = Number(m[2])
  const column = Number(m[3])
  if (!Number.isFinite(line) || !Number.isFinite(column)) return null
  return { file: m[1], line, column }
}
