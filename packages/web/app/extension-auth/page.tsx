import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { connectDb } from '@/lib/db'
import { Project } from '@/lib/models/Project'
import { ensureUser } from '@/lib/users'
import { isMember } from '@/lib/projectAccess'
import { mintMemberToken } from '@/lib/memberToken'
import { AuthRelay } from './AuthRelay'
import { Logo } from '../_marketing/Logo'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="wood-floor min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm relative">
        <div className="tape absolute -top-2 left-8 w-14 h-3.5 rotate-[-5deg] z-10" />
        <div className="tape-cool tape absolute -top-2 right-8 w-12 h-3.5 rotate-[4deg] z-10" />
        <div className="paper rounded-sm shadow-2xl px-8 py-8 text-center space-y-4">
          <div className="flex justify-center mb-2">
            <Logo size="sm" showWordmark={false} />
          </div>
          <h1 className="text-xl" style={{ fontFamily: 'var(--font-display)', color: '#2a1c0e' }}>
            Patchly extension
          </h1>
          {children}
        </div>
      </div>
    </div>
  )
}

export default async function ExtensionAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  if (!projectId) return <Shell><p className="text-sm" style={{ color: '#dc2626' }}>Missing projectId.</p></Shell>

  const session = await auth()
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/extension-auth?projectId=${projectId}`)}`)
  }
  const userId = session.user.id

  await ensureUser(session)
  await connectDb()
  const project = await Project.findById(projectId).lean()
  if (!project) return <Shell><p className="text-sm" style={{ color: '#dc2626' }}>Project not found.</p></Shell>
  if (!isMember(project, userId)) {
    return <Shell><p className="text-sm" style={{ color: '#6b4e30' }}>You&apos;re not a member of this project. Ask the owner for an invite link.</p></Shell>
  }

  const name = session.user.name || session.user.username || 'Member'
  const image = session.user.image ?? undefined
  const token = await mintMemberToken({ userId, name, image })

  return (
    <Shell>
      <AuthRelay token={token} identity={{ userId, name, image }} />
    </Shell>
  )
}
