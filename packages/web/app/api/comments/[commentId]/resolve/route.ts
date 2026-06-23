// app/api/comments/[commentId]/resolve/route.ts
// PATCH — mark a comment resolved + delete its screenshot. devToken only.

import { connectDb } from '@/lib/db'
import { resolveAuth } from '@/lib/apiAuth'
import { Comment } from '@/lib/models/Comment'
import { resolveCommentSchema } from '@/lib/schemas'
import { toComment } from '@/lib/serialize'
import { deleteScreenshot } from '@/lib/uploadthing'
import { ok, err } from '@/lib/http'

export async function PATCH(req: Request, { params }: { params: { commentId: string } }) {
  const a = await resolveAuth(req)
  if (a.kind !== 'devToken') return err('Unauthorized', 401)

  const body = await req.json().catch(() => null)
  const parsed = resolveCommentSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.message, 422)

  await connectDb()
  const comment = await Comment.findById(params.commentId)
  if (!comment) return err('Comment not found', 404)
  if (String(comment.projectId) !== a.projectId) return err('Forbidden', 403)

  comment.status = 'resolved'
  comment.resolvedAt = new Date()
  comment.resolvedBy = parsed.data.resolvedBy
  await comment.save()

  await deleteScreenshot(comment.screenshot?.key)

  return ok(toComment(comment))
}
