// lib/serialize.ts
// The boundary that turns Mongo documents into plain JSON: _id → id (string),
// every ObjectId → string, every Date → ISO string. Every API route returns
// these — never a raw Mongoose doc — so the agent's CloudCommentClient (Step 3)
// gets a stable, plain ReviewComment shape with zero ObjectId/Date drift.

import type { CommentDoc } from '@/lib/models/Comment'
import type { ProjectDoc } from '@/lib/models/Project'
import type { ReviewLinkDoc } from '@/lib/models/ReviewLink'

const iso = (d?: Date | null): string | undefined => (d ? new Date(d).toISOString() : undefined)

export interface SerializedComment {
  id: string
  projectId: string
  kind: 'element' | 'area'
  patchlySrc?: string
  tag?: string
  componentName?: string | null
  fingerprint?: { tagName: string; identifyingAttrs?: Record<string, string>; textSnippet?: string; domIndex?: number }
  rect?: { x: number; y: number; w: number; h: number }
  pageUrl: string
  note: string
  authorType: 'member' | 'link-reviewer'
  authorId: string
  authorUserId?: string
  authorDisplayName: string
  authorAvatar?: string
  reviewerId?: string
  screenshot?: { url: string; key: string }
  status: 'open' | 'resolved'
  createdAt: string
  resolvedAt?: string
  resolvedBy?: 'dev' | 'agent'
  replies: { id: string; authorType: string; authorDisplayName: string; authorAvatar?: string; note: string; createdAt: string }[]
}

export function toComment(doc: CommentDoc): SerializedComment {
  const fp = doc.fingerprint
  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    kind: doc.kind as 'element' | 'area',
    patchlySrc: doc.patchlySrc ?? undefined,
    tag: doc.tag ?? undefined,
    componentName: doc.componentName ?? undefined,
    fingerprint: fp
      ? {
          tagName: fp.tagName,
          identifyingAttrs: fp.identifyingAttrs ? Object.fromEntries(fp.identifyingAttrs as Map<string, string>) : undefined,
          textSnippet: fp.textSnippet ?? undefined,
          domIndex: (fp.domIndex ?? undefined) as number | undefined,
        }
      : undefined,
    rect: doc.rect ? { x: doc.rect.x, y: doc.rect.y, w: doc.rect.w, h: doc.rect.h } : undefined,
    pageUrl: doc.pageUrl,
    note: doc.note,
    authorType: doc.authorType as 'member' | 'link-reviewer',
    authorId: doc.authorId,
    authorUserId: doc.authorUserId ?? undefined,
    authorDisplayName: doc.authorDisplayName,
    authorAvatar: doc.authorAvatar ?? undefined,
    reviewerId: doc.reviewerId ?? undefined,
    screenshot: doc.screenshot ? { url: doc.screenshot.url, key: doc.screenshot.key } : undefined,
    status: doc.status as 'open' | 'resolved',
    createdAt: iso(doc.createdAt)!,
    resolvedAt: iso(doc.resolvedAt),
    resolvedBy: (doc.resolvedBy ?? undefined) as 'dev' | 'agent' | undefined,
    replies: (doc.replies ?? []).map((r) => ({
      id: String((r as unknown as { _id: unknown })._id ?? ''),
      authorType: r.authorType as 'member' | 'link-reviewer',
      authorDisplayName: r.authorDisplayName,
      authorAvatar: r.authorAvatar ?? undefined,
      note: r.note,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ''),
    })),
  }
}

export interface SerializedProject {
  id: string
  name: string
  ownerId: string
  members: { userId: string; role: 'owner' | 'member' }[]
  domains: string[]
  devToken?: string // only included for the owner (it's a full-access secret)
  createdAt: string
}

export function toProject(doc: ProjectDoc, opts: { includeDevToken?: boolean } = {}): SerializedProject {
  return {
    id: String(doc._id),
    name: doc.name,
    ownerId: doc.ownerId,
    members: (doc.members ?? []).map((m) => ({ userId: m.userId, role: m.role as 'owner' | 'member' })),
    domains: doc.domains ?? [],
    ...(opts.includeDevToken ? { devToken: doc.devToken } : {}),
    createdAt: iso(doc.createdAt)!,
  }
}

export interface SerializedLink {
  id: string
  projectId: string
  token?: string // only included on creation
  label: string
  createdBy: string
  createdAt: string
  expiresAt?: string
  revokedAt?: string
}

export function toLink(doc: ReviewLinkDoc, includeToken = false): SerializedLink {
  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    ...(includeToken ? { token: doc.token } : {}),
    label: doc.label,
    createdBy: doc.createdBy,
    createdAt: iso(doc.createdAt)!,
    expiresAt: iso(doc.expiresAt),
    revokedAt: iso(doc.revokedAt),
  }
}
