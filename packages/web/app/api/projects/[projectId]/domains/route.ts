// app/api/projects/[projectId]/domains/route.ts
// PATCH — replace the project's domain list. Owner (session) only.

import { connectDb } from '@/lib/db'
import { resolveAuth } from '@/lib/apiAuth'
import { Project } from '@/lib/models/Project'
import { patchDomainsSchema } from '@/lib/schemas'
import { toProject } from '@/lib/serialize'
import { ok, err } from '@/lib/http'

export async function PATCH(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const a = await resolveAuth(req)
  if (a.kind !== 'session') return err('Unauthorized', 401)

  const body = await req.json().catch(() => null)
  const parsed = patchDomainsSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.message, 422)

  await connectDb()
  const project = await Project.findById(projectId)
  if (!project) return err('Project not found', 404)
  if (project.ownerId !== a.userId) return err('Forbidden', 403)

  project.domains = parsed.data.domains
  await project.save()
  return ok(toProject(project))
}
