// app/api/comments/route.ts
// POST   — add a comment. linkToken (write) OR devToken (write).
// GET     — list comments for a project (?projectId=&status=). devToken only.
// DELETE  — bulk-delete resolved comments (?projectId=&status=resolved). devToken only.

import { connectDb } from '@/lib/db'
import { resolveAuth } from '@/lib/apiAuth'
import { Project } from '@/lib/models/Project'
import { ReviewLink } from '@/lib/models/ReviewLink'
import { Comment } from '@/lib/models/Comment'
import { createCommentSchema } from '@/lib/schemas'
import { toComment } from '@/lib/serialize'
import { deleteScreenshot } from '@/lib/uploadthing'
import { ok, err } from '@/lib/http'

// Derive an origin-independent path for cross-origin (localhost/tunnel/beta) matching.
function pathOf(u: string): string {
  try { return new URL(u).pathname } catch { return u }
}

export async function POST(req: Request) {
  const a = await resolveAuth(req)
  if (a.kind !== 'linkToken' && a.kind !== 'devToken' && a.kind !== 'member') return err('Unauthorized', 401)

  const body = await req.json().catch(() => null)
  const parsed = createCommentSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.message, 422)
  const d = parsed.data

  // The token's project must match the body's projectId.
  if (d.projectId !== a.projectId) return err('Project mismatch for this token', 403)

  await connectDb()

  // Resolve author identity from the token context (server-trusted, not from the body).
  let authorType: 'member' | 'link-reviewer'
  let authorId: string
  let authorUserId: string | undefined
  let authorDisplayName: string
  let authorAvatar: string | undefined
  if (a.kind === 'linkToken') {
    authorType = 'link-reviewer'
    authorId = a.linkId
    authorDisplayName = d.authorDisplayName
  } else if (a.kind === 'member') {
    // Authenticated teammate — identity comes from the verified member token.
    authorType = 'member'
    authorId = a.userId
    authorUserId = a.userId
    authorDisplayName = a.name || d.authorDisplayName
    authorAvatar = a.image
  } else {
    // devToken (agent automation without a signed-in member) → generic dev.
    const project = await Project.findById(a.projectId).lean()
    if (!project) return err('Project not found', 404)
    authorType = 'member'
    authorId = project.ownerId
    authorDisplayName = d.authorDisplayName
  }

  // When the reviewer uploaded a screenshot via UploadThing before submitting,
  // derive the CDN URL from the key — utfs.io CDN URLs are stable and predictable.
  const screenshot = d.screenshotUploadKey
    ? { key: d.screenshotUploadKey, url: `https://utfs.io/f/${d.screenshotUploadKey}` }
    : undefined

  const doc = await Comment.create({
    projectId: d.projectId,
    kind: d.kind,
    patchlySrc: d.patchlySrc,
    tag: d.tag,
    componentName: d.componentName ?? undefined,
    fingerprint: d.fingerprint,
    rect: d.rect,
    pageUrl: d.pageUrl,
    pagePath: pathOf(d.pageUrl),
    note: d.note, // stored verbatim — untrusted
    authorType,
    authorId,
    authorUserId,
    authorDisplayName,
    authorAvatar,
    reviewerId: d.reviewerId,
    screenshot,
    status: 'open',
  })

  return ok(toComment(doc), 201)
}

export async function GET(req: Request) {
  const a = await resolveAuth(req)
  // devToken → full read access; linkToken → read open comments for their project+pageUrl only
  if (a.kind !== 'devToken' && a.kind !== 'linkToken') return err('Unauthorized', 401)

  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId')
  const status    = url.searchParams.get('status') ?? 'open'
  const pageUrl   = url.searchParams.get('pageUrl') // required for linkToken callers

  if (!projectId) return err('projectId is required', 400)
  if (projectId !== a.projectId) return err('Project mismatch for this token', 403)

  await connectDb()

  if (a.kind === 'linkToken') {
    // Client overlay: read-only, always open status, scoped by PATH (origin-independent).
    if (!pageUrl) return err('pageUrl is required for link-scoped reads', 400)
    const pagePath = pathOf(pageUrl)
    const docs = await Comment.find({ projectId, status: 'open', pagePath }).sort({ createdAt: -1 })
    return ok(docs.map(toComment))
  }

  // devToken: full access with status filter
  const filter: Record<string, unknown> = { projectId }
  if (status !== 'all') filter.status = status
  const docs = await Comment.find(filter).sort({ createdAt: -1 })
  return ok(docs.map(toComment))
}

export async function DELETE(req: Request) {
  const a = await resolveAuth(req)
  if (a.kind !== 'devToken') return err('Unauthorized', 401)

  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId')
  const status = url.searchParams.get('status') ?? 'resolved'
  if (!projectId) return err('projectId is required', 400)
  if (projectId !== a.projectId) return err('Project mismatch for this token', 403)
  if (status !== 'resolved') return err('Bulk delete only supports status=resolved', 400)

  await connectDb()
  const docs = await Comment.find({ projectId, status: 'resolved' })
  for (const doc of docs) await deleteScreenshot(doc.screenshot?.key)
  await Comment.deleteMany({ projectId, status: 'resolved' })
  return ok({ deleted: docs.length })
}
