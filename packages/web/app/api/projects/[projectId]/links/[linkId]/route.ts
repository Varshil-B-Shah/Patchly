// app/api/projects/[projectId]/links/[linkId]/route.ts
// DELETE — revoke a review link (sets revokedAt; keeps the row for audit). Owner only.

import { connectDb } from '@/lib/db'
import { resolveAuth } from '@/lib/apiAuth'
import { Project } from '@/lib/models/Project'
import { ReviewLink } from '@/lib/models/ReviewLink'
import { toLink } from '@/lib/serialize'
import { ok, err } from '@/lib/http'

export async function DELETE(
  req: Request,
  { params }: { params: { projectId: string; linkId: string } },
) {
  const a = await resolveAuth(req)
  if (a.kind !== 'session') return err('Unauthorized', 401)

  await connectDb()
  const project = await Project.findById(params.projectId)
  if (!project) return err('Project not found', 404)
  if (project.ownerId !== a.userId) return err('Forbidden', 403)

  const link = await ReviewLink.findOne({ _id: params.linkId, projectId: project._id })
  if (!link) return err('Link not found', 404)

  if (!link.revokedAt) {
    link.revokedAt = new Date()
    await link.save()
  }
  return ok(toLink(link))
}
