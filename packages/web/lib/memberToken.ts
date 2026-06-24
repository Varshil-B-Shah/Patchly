// lib/memberToken.ts
// Per-user member tokens for the extension. Signed JWT (HS256, AUTH_SECRET) that
// identifies a teammate + the project they're acting on. Stateless, but every
// verification re-checks live project membership — so removing a member revokes
// their token immediately (see resolveAuth).

import { SignJWT, jwtVerify } from 'jose'

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? '')

export interface MemberTokenClaims {
  userId: string
  projectId: string
  name: string
  image?: string
}

export async function mintMemberToken(c: MemberTokenClaims): Promise<string> {
  return new SignJWT({ projectId: c.projectId, name: c.name, image: c.image })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(c.userId)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret())
}

export async function verifyMemberToken(token: string): Promise<MemberTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    if (!payload.sub || typeof payload.projectId !== 'string') return null
    return {
      userId: payload.sub,
      projectId: payload.projectId,
      name: typeof payload.name === 'string' ? payload.name : '',
      image: typeof payload.image === 'string' ? payload.image : undefined,
    }
  } catch {
    return null
  }
}
