export interface Reply {
  id: string
  authorType: 'member' | 'link-reviewer'
  authorDisplayName: string
  authorAvatar?: string
  note: string
  createdAt: string
}

export interface ReviewComment {
  id: string
  kind: 'element' | 'area'
  // kind === 'element'
  patchlySrc?: string
  tag?: string
  componentName?: string | null
  fingerprint?: {
    tagName: string
    identifyingAttrs?: Record<string, string>
    textSnippet?: string
    /** Index among all elements sharing this data-patchly-src — disambiguates
     *  reused components even when text is empty or identical. */
    domIndex?: number
  }
  // kind === 'area'
  rect?: { x: number; y: number; w: number; h: number }
  pageUrl: string
  note: string
  author?: string
  authorAvatar?: string
  screenshot?: string | { url: string; key: string }
  status: 'open' | 'resolved'
  createdAt: string
  resolvedAt?: string
  resolvedBy?: 'dev' | 'agent'
  replies?: Reply[]
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
