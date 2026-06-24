// types/next-auth.d.ts
// Augment NextAuth's Session/JWT so session.user.id and token.uid are typed.
import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      username?: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string
    username?: string
  }
}
