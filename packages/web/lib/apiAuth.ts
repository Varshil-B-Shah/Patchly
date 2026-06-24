// lib/apiAuth.ts
// Shared auth resolver for every API route. Two strategies:
//   a) Session  — NextAuth cookie (dev dashboard routes)
//   b) Token    — Bearer token in the Authorization header:
//        devToken  → matches Project.devToken  → full read/write for that project
//        linkToken → matches ReviewLink.token  → write-only (add comments),
//                    rejected if expired or revoked

import { auth } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { Project } from '@/lib/models/Project'
import { ReviewLink } from '@/lib/models/ReviewLink'
import { verifyMemberToken } from '@/lib/memberToken'
import { isMember } from '@/lib/projectAccess'

export type AuthContext =
  | { kind: 'session'; userId: string }
  | { kind: 'devToken'; projectId: string }
  | { kind: 'member'; projectId: string; userId: string; name: string; image?: string }
  | { kind: 'linkToken'; projectId: string; linkId: string }
  | { kind: 'none' }

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

/** Resolve the caller's auth. Session is checked only when no bearer token is present. */
export async function resolveAuth(req: Request): Promise<AuthContext> {
  const token = bearer(req)

  if (token) {
    await connectDb()

    const project = await Project.findOne({ devToken: token }).lean()
    if (project) return { kind: 'devToken', projectId: String(project._id) }

    // Member token (signed JWT). Re-check live membership so removal = instant revoke.
    if (token.includes('.')) {
      const claims = await verifyMemberToken(token)
      if (claims) {
        const proj = await Project.findById(claims.projectId).lean()
        if (proj && isMember(proj, claims.userId)) {
          return { kind: 'member', projectId: claims.projectId, userId: claims.userId, name: claims.name, image: claims.image }
        }
        return { kind: 'none' } // valid signature but no longer a member → revoked
      }
    }

    const link = await ReviewLink.findOne({ token }).lean()
    if (link) {
      if (link.revokedAt) return { kind: 'none' }
      if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return { kind: 'none' }
      return { kind: 'linkToken', projectId: String(link.projectId), linkId: String(link._id) }
    }

    return { kind: 'none' }
  }

  const session = await auth()
  if (session?.user?.id) return { kind: 'session', userId: session.user.id }

  return { kind: 'none' }
}
