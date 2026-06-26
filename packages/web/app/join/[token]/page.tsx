import { auth } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { Project } from '@/lib/models/Project'
import { ensureUser } from '@/lib/users'
import { isMember } from '@/lib/projectAccess'
import { redirect } from 'next/navigation'
import { Logo } from '../../_marketing/Logo'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="wood-floor min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm relative">
        <div className="tape absolute -top-2 left-8 w-14 h-3.5 rotate-[-5deg] z-10" />
        <div className="tape-warm tape absolute -top-2 right-8 w-12 h-3.5 rotate-[4deg] z-10" />
        <div className="paper rounded-sm shadow-2xl px-8 py-8 text-center space-y-3">
          <div className="flex justify-center mb-2">
            <Logo size="sm" showWordmark={false} />
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const session = await auth()

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/join/${token}`)}`)
  }
  const userId = session.user.id

  await ensureUser(session)
  await connectDb()

  const project = await Project.findOne({ inviteToken: token })
  if (!project) {
    return (
      <Shell>
        <h1 className="text-xl" style={{ fontFamily: 'var(--font-display)', color: '#2a1c0e' }}>Invite invalid</h1>
        <p className="text-sm" style={{ color: '#6b4e30' }}>
          This invite link is disabled or doesn&apos;t exist. Ask the project owner for a fresh one.
        </p>
      </Shell>
    )
  }

  if (!isMember(project, userId)) {
    project.members.push({ userId, role: 'member' })
    await project.save()
  }

  redirect(`/dashboard/${String(project._id)}`)
}
