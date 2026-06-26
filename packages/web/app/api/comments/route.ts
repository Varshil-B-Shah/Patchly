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
import { isMember } from '@/lib/projectAccess'

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

  await connectDb()

  // Resolve author identity from the token context (server-trusted, not from the body).
  let authorType: 'member' | 'link-reviewer'
  let authorId: string
  let authorUserId: string | undefined
  let authorDisplayName: string
  let authorAvatar: string | undefined

  if (a.kind === 'linkToken') {
    // linkToken already scopes to a project — verify it matches.
    if (d.projectId !== a.projectId) return err('Project mismatch for this token', 403)
    authorType = 'link-reviewer'
    authorId = a.linkId
    authorDisplayName = d.authorDisplayName
  } else if (a.kind === 'member') {
    // GitHub-authenticated teammate — check they're a member of the requested project.
    const project = await Project.findById(d.projectId).lean()
    if (!project) return err('Project not found', 404)
    if (!isMember(project, a.userId)) return err('Not a member of this project', 403)
    authorType = 'member'
    authorId = a.userId
    authorUserId = a.userId
    authorDisplayName = a.name || d.authorDisplayName
    authorAvatar = a.image
  } else {
    // devToken — project is encoded in the token itself.
    if (d.projectId !== a.projectId) return err('Project mismatch for this token', 403)
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
  if (a.kind !== 'devToken' && a.kind !== 'linkToken' && a.kind !== 'member') return err('Unauthorized', 401)

  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId')
  const status    = url.searchParams.get('status') ?? 'open'
  const pageUrl   = url.searchParams.get('pageUrl') // required for linkToken callers

  if (!projectId) return err('projectId is required', 400)

  await connectDb()

  // Project-scoped access check — varies by token kind.
  if (a.kind === 'linkToken') {
    if (projectId !== a.projectId) return err('Project mismatch for this token', 403)
  } else if (a.kind === 'member') {
    const project = await Project.findById(projectId).lean()
    if (!project || !isMember(project, a.userId)) return err('Not a member of this project', 403)
  } else {
    // devToken
    if (projectId !== a.projectId) return err('Project mismatch for this token', 403)
  }

  if (a.kind === 'linkToken') {
    // Client overlay: read-only, always open status, scoped by PATH (origin-independent).
    if (!pageUrl) return err('pageUrl is required for link-scoped reads', 400)
    const pagePath = pathOf(pageUrl)
    const docs = await Comment.find({ projectId, status: 'open', pagePath }).sort({ createdAt: -1 })
    return ok(docs.map(toComment))
  }

  // devToken or member: full access with status filter
  const filter: Record<string, unknown> = { projectId }
  if (status !== 'all') filter.status = status
  const docs = await Comment.find(filter).sort({ createdAt: -1 })
  return ok(docs.map(toComment))
}

export async function DELETE(req: Request) {
  const a = await resolveAuth(req)
  if (a.kind !== 'devToken' && a.kind !== 'member') return err('Unauthorized', 401)

  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId')
  const status = url.searchParams.get('status') ?? 'resolved'
  if (!projectId) return err('projectId is required', 400)
  if (status !== 'resolved' && status !== 'all') return err('Bulk delete only supports status=resolved or status=all', 400)

  await connectDb()
  if (a.kind === 'member') {
    const project = await Project.findById(projectId).lean()
    if (!project || !isMember(project, a.userId)) return err('Not a member of this project', 403)
  } else {
    if (projectId !== a.projectId) return err('Project mismatch for this token', 403)
  }
  const filter = status === 'all' ? { projectId } : { projectId, status: 'resolved' }
  const docs = await Comment.find(filter)
  for (const doc of docs) await deleteScreenshot(doc.screenshot?.key)
  await Comment.deleteMany(filter)
  return ok({ deleted: docs.length })
}
