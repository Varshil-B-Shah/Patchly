// app/api/comments/[commentId]/route.ts
// DELETE — hard-delete a comment + its screenshot. devToken only.

import { connectDb } from '@/lib/db'
import { resolveAuth } from '@/lib/apiAuth'
import { Comment } from '@/lib/models/Comment'
import { deleteScreenshot } from '@/lib/uploadthing'
import { ok, err } from '@/lib/http'

export async function DELETE(req: Request, { params }: { params: Promise<{ commentId: string }> }) {
  const { commentId } = await params
  const a = await resolveAuth(req)
  if (a.kind !== 'devToken') return err('Unauthorized', 401)

  await connectDb()
  const comment = await Comment.findById(commentId)
  if (!comment) return err('Comment not found', 404)
  if (String(comment.projectId) !== a.projectId) return err('Forbidden', 403)

  await deleteScreenshot(comment.screenshot?.key)
  await comment.deleteOne()

  return ok({ deleted: true, id: commentId })
}
