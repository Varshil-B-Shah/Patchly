// app/api/comments/[commentId]/route.ts
// DELETE — hard-delete a comment + its screenshot.
//   devToken → full access (dev/dashboard path).
//   linkToken + reviewerId body → reviewer can delete their OWN comment only.

import { connectDb } from '@/lib/db'
import { resolveAuth } from '@/lib/apiAuth'
import { Project } from '@/lib/models/Project'
import { Comment } from '@/lib/models/Comment'
import { deleteScreenshot } from '@/lib/uploadthing'
import { ok, err } from '@/lib/http'
import { isMember } from '@/lib/projectAccess'

export async function DELETE(req: Request, { params }: { params: Promise<{ commentId: string }> }) {
  const { commentId } = await params
  const a = await resolveAuth(req)
  if (a.kind !== 'devToken' && a.kind !== 'linkToken' && a.kind !== 'member') return err('Unauthorized', 401)

  await connectDb()
  const comment = await Comment.findById(commentId)
  if (!comment) return err('Comment not found', 404)

  if (a.kind === 'member') {
    const project = await Project.findById(comment.projectId).lean()
    if (!project || !isMember(project, a.userId)) return err('Forbidden', 403)
  } else {
    if (String(comment.projectId) !== a.projectId) return err('Forbidden', 403)
  }

  // linkToken callers can only delete their own comments (matched by reviewerId).
  if (a.kind === 'linkToken') {
    const body = await req.json().catch(() => ({})) as { reviewerId?: string }
    if (!body.reviewerId || comment.reviewerId !== body.reviewerId) {
      return err('You can only delete your own comments', 403)
    }
  }

  await deleteScreenshot(comment.screenshot?.key)
  await comment.deleteOne()

  return ok({ deleted: true, id: commentId })
}
