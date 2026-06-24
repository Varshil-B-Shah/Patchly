// lib/users.ts
// User-directory helpers. ensureUser() keeps the User record fresh; it's called
// from Node-runtime server components / actions only (never the edge jwt callback).
import type { Session } from 'next-auth'
import { connectDb } from '@/lib/db'
import { User, type UserDoc } from '@/lib/models/User'

export async function ensureUser(session: Session | null): Promise<void> {
  const u = session?.user
  if (!u?.id) return
  await connectDb()
  await User.findByIdAndUpdate(
    u.id,
    { username: u.username, name: u.name, image: u.image, updatedAt: new Date() },
    { upsert: true },
  )
}

export interface PublicUser {
  id: string
  username?: string
  name?: string
  image?: string
}

export async function getUsers(ids: string[]): Promise<Map<string, PublicUser>> {
  if (ids.length === 0) return new Map()
  await connectDb()
  const docs = await User.find({ _id: { $in: ids } }).lean<UserDoc[]>()
  const map = new Map<string, PublicUser>()
  for (const d of docs) {
    map.set(String(d._id), {
      id: String(d._id),
      username: d.username ?? undefined,
      name: d.name ?? undefined,
      image: d.image ?? undefined,
    })
  }
  return map
}
