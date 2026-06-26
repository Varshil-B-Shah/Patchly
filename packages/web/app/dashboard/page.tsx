import { auth, signOut } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { Project } from '@/lib/models/Project'
import { Comment } from '@/lib/models/Comment'
import Link from 'next/link'
import { createProject } from '@/app/actions'
import { ensureUser } from '@/lib/users'
import { DashboardShell, Card, CardTitle } from '../_dashboard/DashboardShell'

export default async function DashboardPage() {
  const session = await auth()
  const userId  = session!.user!.id as string

  await ensureUser(session)
  await connectDb()
  const projects = await Project.find({
    $or: [{ ownerId: userId }, { 'members.userId': userId }],
  }).sort({ createdAt: -1 }).lean()

  const counts = await Promise.all(
    projects.map((p) => Comment.countDocuments({ projectId: p._id, status: 'open' }))
  )

  return (
    <DashboardShell
      breadcrumb={[{ label: 'Projects' }]}
      userName={session?.user?.name ?? undefined}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <h1
            className="text-[1.7rem]"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--w-cream)', textShadow: '0 2px 12px rgba(0,0,0,.4)' }}
          >
            Projects
          </h1>
          <span className="text-[0.78rem]" style={{ color: 'var(--text-muted)' }}>
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Project list */}
        {projects.length === 0 ? (
          <div
            className="py-10 text-center text-sm rounded-sm border"
            style={{ color: 'var(--text-muted)', borderColor: 'rgba(100,75,45,0.2)', background: 'rgba(255,255,255,0.02)' }}
          >
            No projects yet — create one below.
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((p, i) => (
              <Link
                key={String(p._id)}
                href={`/dashboard/${p._id}`}
                className="block rounded-sm transition-opacity hover:opacity-90 relative"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(150,110,70,0.18)' }}
              >
                <div className="tape-warm tape absolute -top-1 left-4 w-8 h-2 -rotate-3" />
                <div className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-[0.95rem]" style={{ color: 'var(--w-cream)' }}>{p.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {p.domains.join(', ') || 'no domains configured'}
                    </div>
                  </div>
                  {counts[i] > 0 && (
                    <span
                      className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{ background: 'rgba(99,102,241,0.25)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}
                    >
                      {counts[i]} open
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* New project */}
        <Card>
          <div className="tape absolute -top-1.5 left-6 w-12 h-3 rotate-[-4deg] tape" />
          <CardTitle>New project</CardTitle>
          <form action={createProject} className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: '#6b4e30' }}>Name</label>
              <input
                name="name"
                required
                placeholder="Acme App"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ borderColor: 'rgba(160,120,70,0.35)', background: 'rgba(255,248,235,0.8)', color: '#2a1c0e', '--tw-ring-color': 'rgba(160,120,70,0.4)' } as React.CSSProperties}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: '#6b4e30' }}>Domains (comma-separated)</label>
              <input
                name="domains"
                placeholder="localhost:5173, acme-preview.vercel.app"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ borderColor: 'rgba(160,120,70,0.35)', background: 'rgba(255,248,235,0.8)', color: '#2a1c0e', '--tw-ring-color': 'rgba(160,120,70,0.4)' } as React.CSSProperties}
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2 rounded-sm text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: 'rgba(200,168,100,0.22)', border: '1px solid rgba(200,168,100,0.45)', color: '#2a1c0e' }}
            >
              Create project
            </button>
          </form>
        </Card>
      </div>
    </DashboardShell>
  )
}
