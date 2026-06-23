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
  })
  return ok(toProject(doc), 201)
}

export async function GET(req: Request) {
  const a = await resolveAuth(req)
  if (a.kind !== 'session') return err('Unauthorized', 401)

  await connectDb()
  const docs = await Project.find({ ownerId: a.userId }).sort({ createdAt: -1 })
  return ok(docs.map(toProject))
}
