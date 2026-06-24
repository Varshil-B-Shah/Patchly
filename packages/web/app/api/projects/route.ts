// app/api/projects/route.ts
// POST  — create a project (+ devToken). Session auth.
// GET   — list the session user's projects. Session auth.

import { connectDb } from '@/lib/db'
import { resolveAuth } from '@/lib/apiAuth'
import { Project } from '@/lib/models/Project'
import { createProjectSchema } from '@/lib/schemas'
import { toProject } from '@/lib/serialize'
import { ok, err } from '@/lib/http'

export async function POST(req: Request) {
  const a = await resolveAuth(req)
  if (a.kind !== 'session') return err('Unauthorized', 401)

  const body = await req.json().catch(() => null)
  const parsed = createProjectSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.message, 422)

  await connectDb()
  const doc = await Project.create({
    name: parsed.data.name,
    domains: parsed.data.domains,
    ownerId: a.userId,
    members: [{ userId: a.userId, role: 'owner' }],
  })
  // Caller is the owner — include the devToken once on creation.
  return ok(toProject(doc, { includeDevToken: true }), 201)
}

export async function GET(req: Request) {
  const a = await resolveAuth(req)
  if (a.kind !== 'session') return err('Unauthorized', 401)

  await connectDb()
  // Projects I own or am a member of. devToken included only for projects I own.
  const docs = await Project.find({
    $or: [{ ownerId: a.userId }, { 'members.userId': a.userId }],
  }).sort({ createdAt: -1 })
  return ok(docs.map((d) => toProject(d, { includeDevToken: d.ownerId === a.userId })))
}
