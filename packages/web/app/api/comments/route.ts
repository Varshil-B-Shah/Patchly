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

export async function POST(req: Request) {
  const a = await resolveAuth(req)
  if (a.kind !== 'linkToken' && a.kind !== 'devToken') return err('Unauthorized', 401)

  const body = await req.json().catch(() => null)
  const parsed = createCommentSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.message, 422)
  const d = parsed.data

  // The token's project must match the body's projectId.
  if (d.projectId !== a.projectId) return err('Project mismatch for this token', 403)

  await connectDb()

  // Resolve author identity from the token context.
  let authorType: 'member' | 'link-reviewer'
  let authorId: string
  if (a.kind === 'linkToken') {
    authorType = 'link-reviewer'
    authorId = a.linkId
  } else {
    const project = await Project.findById(a.projectId).lean()
    if (!project) return err('Project not found', 404)
    authorType = 'member'
    authorId = project.ownerId
  }

  // TODO(Step2): when screenshotUploadKey is present, look up the UploadThing
  // file (url + key) and store as screenshot. Ignored for now.
  const doc = await Comment.create({
    projectId: d.projectId,
    kind: d.kind,
    patchlySrc: d.patchlySrc,
    tag: d.tag,
    componentName: d.componentName ?? undefined,
    fingerprint: d.fingerprint,
    rect: d.rect,
    pageUrl: d.pageUrl,
    note: d.note, // stored verbatim — untrusted
    authorType,
    authorId,
    authorDisplayName: d.authorDisplayName,
    reviewerId: d.reviewerId,
    status: 'open',
  })

  return ok(toComment(doc), 201)
}

export async function GET(req: Request) {
  const a = await resolveAuth(req)
  if (a.kind !== 'devToken') return err('Unauthorized', 401)

  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId')
  const status = url.searchParams.get('status') ?? 'open'
  if (!projectId) return err('projectId is required', 400)
  if (projectId !== a.projectId) return err('Project mismatch for this token', 403)

  await connectDb()
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
