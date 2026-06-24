// app/api/projects/[projectId]/links/route.ts
// POST — create a review link (returns token + shareUrl, once). Owner only.
// GET  — list links for the project (token OMITTED). Owner only.

import { connectDb } from '@/lib/db'
import { resolveAuth } from '@/lib/apiAuth'
import { Project } from '@/lib/models/Project'
import { ReviewLink } from '@/lib/models/ReviewLink'
import { createLinkSchema } from '@/lib/schemas'
import { toLink } from '@/lib/serialize'
import { ok, err } from '@/lib/http'

async function assertOwner(req: Request, projectId: string) {
  const a = await resolveAuth(req)
  if (a.kind !== 'session') return { error: err('Unauthorized', 401) }
  await connectDb()
  const project = await Project.findById(projectId)
  if (!project) return { error: err('Project not found', 404) }
  if (project.ownerId !== a.userId) return { error: err('Forbidden', 403) }
  return { project }
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const guard = await assertOwner(req, projectId)
  if ('error' in guard) return guard.error

  const body = await req.json().catch(() => null)
  const parsed = createLinkSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.message, 422)

  const a = await resolveAuth(req) // already known session; cheap re-read for userId
  const createdBy = a.kind === 'session' ? a.userId : ''

  const doc = await ReviewLink.create({
    projectId: guard.project._id,
    label: parsed.data.label,
    createdBy,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
  })

  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  const shareUrl = `${base.replace(/\/+$/, '')}/review/${doc.token}`

  return ok({ linkId: String(doc._id), token: doc.token, shareUrl }, 201)
}

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const guard = await assertOwner(req, projectId)
  if ('error' in guard) return guard.error

  const docs = await ReviewLink.find({ projectId: guard.project._id }).sort({ createdAt: -1 })
  return ok(docs.map((d) => toLink(d))) // token omitted (includeToken defaults false)
}
