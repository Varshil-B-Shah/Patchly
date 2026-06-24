import { auth } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { Project } from '@/lib/models/Project'
import { ReviewLink } from '@/lib/models/ReviewLink'
import { Comment } from '@/lib/models/Comment'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CopyButton } from '@/app/dashboard/CopyButton'
import { NewLinkForm } from './NewLinkForm'
import { patchDomains, revokeLink, generateInvite, disableInvite, removeMember } from '@/app/actions'
import { isMember, isOwner } from '@/lib/projectAccess'
import { ensureUser, getUsers } from '@/lib/users'

function fmt(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const session = await auth()
  const userId  = session!.user!.id as string

  await ensureUser(session)
  await connectDb()
  const project = await Project.findById(projectId).lean()
  if (!project || !isMember(project, userId)) notFound()

  const owner = isOwner(project, userId)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const openCount = await Comment.countDocuments({ projectId: project._id, status: 'open' })

  // Members (+ make sure the owner always appears even on legacy docs).
  const members = project.members?.length
    ? project.members
    : [{ userId: project.ownerId, role: 'owner' as const }]
  const userMap = await getUsers(members.map((m) => m.userId))

  const links = owner
    ? await ReviewLink.find({ projectId: project._id }).sort({ createdAt: -1 }).lean()
    : []

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-gray-700">Projects</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">{project.name}</span>
      </div>

      {/* Comments badge */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{project.name}</h1>
        <Link
          href={`/dashboard/${projectId}/comments`}
          className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-100 transition"
        >
          {openCount > 0 && (
            <span className="bg-indigo-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{openCount}</span>
          )}
          View comments →
        </Link>
      </div>

      {/* Members */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Team</h2>
        <div className="space-y-2">
          {members.map((m) => {
            const u = userMap.get(m.userId)
            return (
              <div key={m.userId} className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={u?.image || `https://avatars.githubusercontent.com/u/${m.userId}?v=4`}
                  alt=""
                  className="w-7 h-7 rounded-full bg-gray-100"
                />
                <span className="text-sm text-gray-800">{u?.name || u?.username || m.userId}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  m.role === 'owner' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {m.role}
                </span>
                {owner && m.role !== 'owner' && (
                  <form action={removeMember.bind(null, projectId, m.userId)} className="ml-auto">
                    <button className="text-xs text-red-500 hover:text-red-600">Remove</button>
                  </form>
                )}
              </div>
            )
          })}
        </div>

        {/* Invite link (owner only) */}
        {owner && (
          <div className="pt-3 border-t border-gray-100 space-y-2">
            {project.inviteToken ? (
              <>
                <p className="text-xs text-gray-500">Anyone signed in who opens this link joins as a member.</p>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-gray-600 truncate">{`${appUrl}/join/${project.inviteToken}`}</span>
                  <CopyButton text={`${appUrl}/join/${project.inviteToken}`} label="Copy invite" />
                  <form action={disableInvite.bind(null, projectId)}>
                    <button className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition">Disable</button>
                  </form>
                </div>
              </>
            ) : (
              <form action={generateInvite.bind(null, projectId)}>
                <button className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition font-medium">
                  Generate invite link
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      {/* Owner-only: domains, devToken, links */}
      {owner && (
        <>
          {/* Domains */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
            <h2 className="font-semibold text-gray-900">Domains</h2>
            <p className="text-xs text-gray-500">Comma-separated. The overlay auto-discovers the project from these.</p>
            <form action={patchDomains.bind(null, projectId)} className="flex gap-3 items-start">
              <input
                name="domains"
                defaultValue={project.domains.join(', ')}
                placeholder="localhost:5173, myapp.vercel.app"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                type="submit"
                className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition font-medium whitespace-nowrap"
              >
                Save
              </button>
            </form>
          </section>

          {/* Dev token */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
            <h2 className="font-semibold text-gray-900">Dev token</h2>
            <p className="text-xs text-gray-500">Use as Bearer token for agent cloud mode and API access. Treat like a secret.</p>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-gray-400 select-none">{'•'.repeat(32)}</span>
              <CopyButton text={project.devToken} label="Copy token" />
            </div>
          </section>

          {/* Review links */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
            <h2 className="font-semibold text-gray-900">Review links</h2>
            {links.length === 0 ? (
              <p className="text-sm text-gray-400">No links yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                      <th className="pb-2 font-medium">Label</th>
                      <th className="pb-2 font-medium">Created</th>
                      <th className="pb-2 font-medium">Expires</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {links.map((l) => {
                      const isRevoked = !!l.revokedAt
                      const isExpired = l.expiresAt ? new Date(l.expiresAt) < new Date() : false
                      const status = isRevoked ? 'Revoked' : isExpired ? 'Expired' : 'Active'
                      const shareUrl = `${appUrl}/review/${l.token}`
                      return (
                        <tr key={String(l._id)} className="hover:bg-gray-50">
                          <td className="py-2.5 pr-4 font-medium text-gray-800">{l.label}</td>
                          <td className="py-2.5 pr-4 text-gray-500">{fmt(l.createdAt)}</td>
                          <td className="py-2.5 pr-4 text-gray-500">{l.expiresAt ? fmt(l.expiresAt) : '—'}</td>
                          <td className="py-2.5 pr-4">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {status}
                            </span>
                          </td>
                          <td className="py-2.5 flex items-center gap-2">
                            {status === 'Active' && (
                              <>
                                <CopyButton text={shareUrl} label="Copy URL" />
                                <form action={revokeLink.bind(null, projectId, String(l._id))}>
                                  <button className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50 transition">
                                    Revoke
                                  </button>
                                </form>
                              </>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="pt-2 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-700 mb-3">New review link</h3>
              <NewLinkForm projectId={projectId} />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
