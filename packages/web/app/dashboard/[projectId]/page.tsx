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
import { DashboardShell, Card, CardTitle } from '../../_dashboard/DashboardShell'

const inputCls = 'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1'
const inputStyle = { borderColor: 'rgba(160,120,70,0.35)', background: 'rgba(255,248,235,0.85)', color: '#2a1c0e' }
const btnPrimary = 'px-4 py-2 rounded-sm text-sm font-semibold transition-opacity hover:opacity-80 whitespace-nowrap'
const btnPrimaryStyle = { background: 'rgba(200,168,100,0.22)', border: '1px solid rgba(200,168,100,0.45)', color: '#2a1c0e' }
const btnDanger = 'text-xs px-2.5 py-1 rounded border transition-opacity hover:opacity-80'
const btnDangerStyle = { borderColor: 'rgba(239,68,68,0.35)', color: '#dc2626' }

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

  const ownerInList = (project.members ?? []).some((m) => m.userId === project.ownerId)
  const members: { userId: string; role: 'owner' | 'member' }[] = [
    ...(ownerInList ? [] : [{ userId: project.ownerId, role: 'owner' as const }]),
    ...(project.members ?? []).map((m) => ({ userId: m.userId, role: m.role as 'owner' | 'member' })),
  ]
  const userMap = await getUsers(members.map((m) => m.userId))

  const links = owner
    ? await ReviewLink.find({ projectId: project._id }).sort({ createdAt: -1 }).lean()
    : []

  return (
    <DashboardShell
      breadcrumb={[{ label: 'Projects', href: '/dashboard' }, { label: project.name }]}
      userName={session?.user?.name ?? undefined}
    >
      <div className="space-y-6">
        {/* Title + comments badge */}
        <div className="flex items-center justify-between">
          <h1
            className="text-[1.7rem]"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--w-cream)', textShadow: '0 2px 12px rgba(0,0,0,.4)' }}
          >
            {project.name}
          </h1>
          <Link
            href={`/dashboard/${projectId}/comments`}
            className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-sm transition-opacity hover:opacity-80"
            style={{ background: 'rgba(200,168,100,0.22)', border: '1px solid rgba(200,168,100,0.45)', color: '#2a1c0e' }}
          >
            {openCount > 0 && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(200,168,100,0.5)', color: '#2a1c0e' }}>{openCount}</span>
            )}
            View comments →
          </Link>
        </div>

        {/* Team */}
        <Card>
          <div className="tape absolute -top-1.5 left-5 w-12 h-3 -rotate-3 tape" />
          <CardTitle>Team</CardTitle>
          <div className="space-y-3">
            {members.map((m) => {
              const u = userMap.get(m.userId)
              return (
                <div key={m.userId} className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u?.image || `https://avatars.githubusercontent.com/u/${m.userId}?v=4`} alt="" className="w-7 h-7 rounded-full" />
                  <span className="text-sm" style={{ color: '#3a2a18' }}>{u?.name || u?.username || m.userId}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: m.role === 'owner' ? 'rgba(99,102,241,0.12)' : 'rgba(0,0,0,0.06)', color: m.role === 'owner' ? '#4f46e5' : '#6b4e30' }}
                  >
                    {m.role}
                  </span>
                  {owner && m.role !== 'owner' && (
                    <form action={removeMember.bind(null, projectId, m.userId)} className="ml-auto">
                      <button className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </form>
                  )}
                </div>
              )
            })}
          </div>

          {owner && (
            <div className="mt-4 pt-4 space-y-2" style={{ borderTop: '1px solid rgba(160,120,70,0.2)' }}>
              {project.inviteToken ? (
                <>
                  <p className="text-xs" style={{ color: '#6b4e30' }}>Anyone signed in who opens this link joins as a member.</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs truncate" style={{ color: '#5a3c1a' }}>{`${appUrl}/join/${project.inviteToken}`}</span>
                    <CopyButton text={`${appUrl}/join/${project.inviteToken}`} label="Copy invite" />
                    <form action={disableInvite.bind(null, projectId)}>
                      <button className={btnDanger} style={btnDangerStyle}>Disable</button>
                    </form>
                  </div>
                </>
              ) : (
                <form action={generateInvite.bind(null, projectId)}>
                  <button className={btnPrimary} style={btnPrimaryStyle}>Generate invite link</button>
                </form>
              )}
            </div>
          )}
        </Card>

        {owner && (
          <>
            {/* Domains */}
            <Card>
              <div className="tape-cool tape absolute -top-1.5 right-5 w-10 h-3 rotate-[4deg]" />
              <CardTitle>Domains</CardTitle>
              <p className="text-xs mb-3" style={{ color: '#6b4e30' }}>Comma-separated. The overlay auto-discovers the project from these.</p>
              <form action={patchDomains.bind(null, projectId)} className="flex gap-3 items-start">
                <input name="domains" defaultValue={project.domains.join(', ')} placeholder="localhost:5173, myapp.vercel.app" className={inputCls} style={inputStyle} />
                <button type="submit" className={btnPrimary} style={btnPrimaryStyle}>Save</button>
              </form>
            </Card>

            {/* MCP / agent token */}
            <Card>
              <div className="tape-warm tape absolute -top-1.5 left-5 w-12 h-3 rotate-[-5deg]" />
              <CardTitle>MCP token</CardTitle>
              <p className="text-xs mb-1" style={{ color: '#6b4e30' }}>
                Only needed if you use the <strong>MCP server</strong> (Claude Code, Copilot, Cline) or run the agent
                without the extension open (CI, scripts). Add it to your project's{' '}
                <code className="font-mono">.env</code> as <code className="font-mono">PATCHLY_DEV_TOKEN</code>.
              </p>
              <p className="text-xs mb-3" style={{ color: '#8a6a44' }}>
                If you only use the extension — just sign in with GitHub and skip this entirely.
              </p>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm select-none" style={{ color: '#8a6a44' }}>{'•'.repeat(32)}</span>
                <CopyButton text={project.devToken} label="Copy token" />
              </div>
            </Card>

            {/* Review token */}
            <Card>
              <div className="tape absolute -top-1.5 right-6 w-10 h-3 rotate-3" />
              <CardTitle>Review token</CardTitle>
              <p className="text-xs mb-4" style={{ color: '#6b4e30' }}>
                Generate a token and add it to your app's{' '}
                <code className="font-mono">.env.local</code> as{' '}
                <code className="font-mono">PATCHLY_REVIEW_TOKEN</code>.
                Share your tunnel URL with the client — the review overlay appears automatically.
              </p>

              {/* Active tokens */}
              {links.filter((l) => !l.revokedAt && !(l.expiresAt && new Date(l.expiresAt) < new Date())).length > 0 && (
                <div className="mb-4 space-y-2">
                  {links
                    .filter((l) => !l.revokedAt && !(l.expiresAt && new Date(l.expiresAt) < new Date()))
                    .map((l) => (
                      <div key={String(l._id)} className="flex items-center gap-2">
                        <code className="flex-1 text-xs font-mono px-2 py-1.5 rounded-sm truncate" style={{ background: 'rgba(0,0,0,0.07)', color: '#5a3010' }}>
                          {l.token}
                        </code>
                        <CopyButton text={l.token} label="Copy" />
                        <form action={revokeLink.bind(null, projectId, String(l._id))}>
                          <button className={btnDanger} style={btnDangerStyle}>Revoke</button>
                        </form>
                      </div>
                    ))}
                </div>
              )}

              <NewLinkForm projectId={projectId} />
            </Card>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
