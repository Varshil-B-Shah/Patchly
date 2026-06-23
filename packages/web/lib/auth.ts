// lib/auth.ts
// NextAuth v5 (Auth.js) config. GitHub OAuth only, JWT session strategy, no DB
// adapter (the schema has no User collection). The GitHub profile id is carried
// through the JWT and exposed as session.user.id, which becomes Project.ownerId.

import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, profile }) {
      // On first sign-in, profile is present — stash the GitHub numeric id.
      if (profile?.id != null) token.uid = String(profile.id)
      return token
    },
    session({ session, token }) {
      if (session.user && typeof token.uid === 'string') {
        session.user.id = token.uid
      }
      return session
    },
  },
})
