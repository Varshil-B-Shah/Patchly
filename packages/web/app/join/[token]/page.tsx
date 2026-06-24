import { auth } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { Project } from '@/lib/models/Project'
import { ensureUser } from '@/lib/users'
import { isMember } from '@/lib/projectAccess'
import { redirect } from 'next/navigation'

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const session = await auth()

  // Not signed in → bounce through login, return here afterward.
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/join/${token}`)}`)
  }
  const userId = session.user.id

  await ensureUser(session)
  await connectDb()

  const project = await Project.findOne({ inviteToken: token })
  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md w-full text-center space-y-2 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">Invite invalid</h1>
          <p className="text-sm text-gray-500">This invite link is disabled or doesn&apos;t exist. Ask the project owner for a fresh one.</p>
        </div>
      </div>
    )
  }

  // Add as a member if not already on the team.
  if (!isMember(project, userId)) {
    project.members.push({ userId, role: 'member' })
    await project.save()
  }

  redirect(`/dashboard/${String(project._id)}`)
}
