// lib/projectAccess.ts
// Membership predicates. `ownerId` is treated as an implicit owner so legacy
// projects (created before members[] existed) keep working with no migration.

interface MemberLike { userId: string; role: 'owner' | 'member' }
interface ProjectLike { ownerId: string; members?: MemberLike[] }

export function isMember(p: ProjectLike, userId: string): boolean {
  return p.ownerId === userId || (p.members ?? []).some((m) => m.userId === userId)
}

export function isOwner(p: ProjectLike, userId: string): boolean {
  return (
    p.ownerId === userId ||
    (p.members ?? []).some((m) => m.userId === userId && m.role === 'owner')
  )
}
