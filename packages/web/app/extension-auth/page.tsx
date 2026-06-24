import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { connectDb } from '@/lib/db'
import { Project } from '@/lib/models/Project'
import { ensureUser } from '@/lib/users'
import { isMember } from '@/lib/projectAccess'
import { mintMemberToken } from '@/lib/memberToken'
import { AuthRelay } from './AuthRelay'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md w-full text-center space-y-3 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Patchly extension</h1>
        {children}
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
  if (!projectId) return <Shell><p className="text-sm text-red-500">Missing projectId.</p></Shell>

  const session = await auth()
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/extension-auth?projectId=${projectId}`)}`)
  }
  const userId = session.user.id

  await ensureUser(session)
  await connectDb()
  const project = await Project.findById(projectId).lean()
  if (!project) return <Shell><p className="text-sm text-red-500">Project not found.</p></Shell>
  if (!isMember(project, userId)) {
    return <Shell><p className="text-sm text-gray-500">You&apos;re not a member of this project. Ask the owner for an invite link.</p></Shell>
  }

  const name = session.user.name || session.user.username || 'Member'
  const image = session.user.image ?? undefined
  const token = await mintMemberToken({ userId, projectId, name, image })

  return (
    <Shell>
      <AuthRelay token={token} identity={{ userId, name, image }} />
    </Shell>
  )
}
