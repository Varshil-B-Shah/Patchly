// app/api/comments/[commentId]/replies/route.ts
// POST — add a reply to an existing comment.
//   member | devToken | linkToken — all three can reply.

import { connectDb } from '@/lib/db'
import { resolveAuth } from '@/lib/apiAuth'
import { Comment } from '@/lib/models/Comment'
import { toComment } from '@/lib/serialize'
import { ok, err } from '@/lib/http'
import { z } from 'zod'

const replySchema = z.object({
  note: z.string().min(1).max(5000),       // UNTRUSTED — stored verbatim, never eval'd
  authorDisplayName: z.string().max(120).optional(),
  reviewerId: z.string().max(200).optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const { commentId } = await params
  const a = await resolveAuth(req)
  if (a.kind !== 'member' && a.kind !== 'devToken' && a.kind !== 'linkToken') {
    return err('Unauthorized', 401)
  }

  const body = await req.json().catch(() => null)
  const parsed = replySchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.message, 422)

  await connectDb()
  const comment = await Comment.findById(commentId)
  if (!comment) return err('Comment not found', 404)
  if (String(comment.projectId) !== a.projectId) return err('Forbidden', 403)

  // Build reply with server-trusted identity.
  let authorType: 'member' | 'link-reviewer'
  let authorId: string
  let authorDisplayName: string
  let authorAvatar: string | undefined

  if (a.kind === 'member') {
    authorType = 'member'
    authorId = a.userId
    authorDisplayName = a.name
    authorAvatar = a.image
  } else if (a.kind === 'linkToken') {
    authorType = 'link-reviewer'
    authorId = a.linkId
    authorDisplayName = parsed.data.authorDisplayName ?? 'Reviewer'
  } else {
    authorType = 'member'
    authorId = a.projectId
    authorDisplayName = parsed.data.authorDisplayName ?? 'Dev'
  }

  comment.replies.push({
    authorType,
    authorId,
    authorDisplayName,
    authorAvatar,
    reviewerId: parsed.data.reviewerId,
    note: parsed.data.note,
    createdAt: new Date(),
  } as never)

  await comment.save()
  return ok(toComment(comment))
}
