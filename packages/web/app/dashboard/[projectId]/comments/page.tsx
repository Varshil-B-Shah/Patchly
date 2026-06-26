import { auth } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { Project } from '@/lib/models/Project'
import { Comment } from '@/lib/models/Comment'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { resolveComment, deleteComment, clearResolved } from '@/app/actions'
import { isMember } from '@/lib/projectAccess'
import { DashboardShell } from '../../../_dashboard/DashboardShell'

function relTime(d: Date | string) {
  const diff = Date.now() - new Date(d).getTime()
  const mins  = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default async function CommentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { projectId } = await params
  const { status: rawStatus } = await searchParams
  const session = await auth()
  const userId  = session!.user!.id as string

  await connectDb()
  const project = await Project.findById(projectId).lean()
  if (!project || !isMember(project, userId)) notFound()

  const status = (rawStatus ?? 'open') as 'open' | 'resolved' | 'all'
  const filter: Record<string, unknown> = { projectId: project._id }
  if (status !== 'all') filter.status = status
  const rawDocs = await Comment.find(filter).sort({ createdAt: -1 }).lean()
  const docs = rawDocs.map((d) => ({
    id: String(d._id),
    note: d.note,
    authorDisplayName: d.authorDisplayName,
    authorAvatar: d.authorAvatar ?? undefined,
    tag: d.tag ?? undefined,
    componentName: d.componentName ?? undefined,
    patchlySrc: d.patchlySrc ?? undefined,
    pageUrl: d.pageUrl,
    screenshot: d.screenshot as { url: string; key: string } | undefined,
    status: d.status as 'open' | 'resolved',
    createdAt: (d.createdAt as Date).toISOString(),
    replies: (d.replies ?? []).map((r) => {
      const rv = r as unknown as Record<string, unknown>
      return {
        id: String(rv._id ?? ''),
        authorDisplayName: String(rv.authorDisplayName ?? ''),
        authorAvatar: (rv.authorAvatar as string | undefined) ?? undefined,
        note: String(rv.note ?? ''),
        createdAt: rv.createdAt instanceof Date ? (rv.createdAt as Date).toISOString() : String(rv.createdAt ?? ''),
      }
    }),
  }))

  const resolvedCount = await Comment.countDocuments({ projectId: project._id, status: 'resolved' })

  const tabStyle = (active: boolean) => active
    ? { background: 'rgba(200,168,100,0.22)', border: '1px solid rgba(200,168,100,0.4)', color: '#2a1c0e', fontWeight: 600 }
    : { border: '1px solid transparent', color: '#6b4e30' }

  return (
    <DashboardShell
      breadcrumb={[{ label: 'Projects', href: '/dashboard' }, { label: project.name, href: `/dashboard/${projectId}` }, { label: 'Comments' }]}
      userName={session?.user?.name ?? undefined}
    >
      <div className="space-y-5">
        {/* Header + filter tabs */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1
            className="text-[1.7rem]"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--w-cream)', textShadow: '0 2px 12px rgba(0,0,0,.4)' }}
          >
            Comments
          </h1>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 p-1 rounded-sm" style={{ background: 'rgba(0,0,0,0.2)' }}>
              {(['open', 'resolved', 'all'] as const).map((s) => (
                <Link
                  key={s}
                  href={`/dashboard/${projectId}/comments?status=${s}`}
                  className="px-3 py-1 rounded-sm text-sm capitalize transition-opacity hover:opacity-90"
                  style={tabStyle(status === s)}
                >
                  {s}
                </Link>
              ))}
            </div>
            {resolvedCount > 0 && (
              <form action={clearResolved.bind(null, projectId)}>
                <button
                  className="text-xs px-3 py-1.5 rounded-sm border transition-opacity hover:opacity-80"
                  style={{ borderColor: 'rgba(150,110,70,0.3)', color: 'var(--text-muted)' }}
                >
                  Clear {resolvedCount} resolved
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Comment list */}
        {docs.length === 0 ? (
          <div
            className="py-14 text-center text-sm rounded-sm border"
            style={{ color: 'var(--text-muted)', borderColor: 'rgba(100,75,45,0.2)', background: 'rgba(255,255,255,0.02)' }}
          >
            No {status === 'all' ? '' : status} comments.
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((c) => {
              const path = (() => { try { return new URL(c.pageUrl).pathname } catch { return c.pageUrl } })()
              return (
                <div key={c.id} className="paper rounded-sm shadow-sm relative">
                  <div className="tape absolute -top-1.5 left-5 w-10 h-2.5 -rotate-3" />
                  <div className="px-6 py-5 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1 min-w-0">
                        <p className="text-sm leading-relaxed" style={{ color: '#2a1c0e' }}>{c.note}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" style={{ color: '#6b4e30' }}>
                          {c.authorAvatar && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.authorAvatar} alt="" className="w-4 h-4 rounded-full" />
                          )}
                          <span className="font-medium">{c.authorDisplayName}</span>
                          {c.tag && <span className="font-mono px-1 rounded" style={{ background: 'rgba(160,120,70,0.12)' }}>&lt;{c.tag}&gt;</span>}
                          {c.componentName && <span>{c.componentName}</span>}
                          <a href={c.pageUrl} target="_blank" rel="noreferrer" className="hover:underline truncate max-w-xs opacity-70">{path}</a>
                          <span>·</span>
                          <span>{relTime(c.createdAt)}</span>
                          {c.status === 'resolved' && (
                            <span className="px-1.5 py-0.5 rounded-full font-semibold text-[0.68rem]" style={{ background: 'rgba(34,197,94,0.12)', color: '#15803d' }}>Resolved</span>
                          )}
                        </div>
                      </div>
                      {c.screenshot?.url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.screenshot.url} alt="" className="w-20 h-14 object-cover rounded shrink-0 border" style={{ borderColor: 'rgba(160,120,70,0.2)' }} />
                      )}
                    </div>

                    {/* Replies */}
                    {c.replies.length > 0 && (
                      <div className="ml-4 pl-4 space-y-2" style={{ borderLeft: '2px solid rgba(160,120,70,0.2)' }}>
                        {c.replies.map((r) => (
                          <div key={r.id} className="flex items-start gap-2 text-xs" style={{ color: '#5a3c1a' }}>
                            {r.authorAvatar && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.authorAvatar} alt="" className="w-4 h-4 rounded-full mt-0.5 shrink-0" />
                            )}
                            <span className="font-medium">{r.authorDisplayName}</span>
                            <span className="flex-1">{r.note}</span>
                            <span className="shrink-0 opacity-50">{relTime(r.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    {c.status === 'open' && (
                      <div className="flex gap-2 pt-1">
                        <form action={resolveComment.bind(null, projectId, c.id)}>
                          <button className="text-xs px-3 py-1.5 rounded-sm font-medium transition-opacity hover:opacity-80" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#4f46e5' }}>
                            Resolve
                          </button>
                        </form>
                        <form action={deleteComment.bind(null, projectId, c.id)}>
                          <button className="text-xs px-3 py-1.5 rounded-sm border transition-opacity hover:opacity-80" style={{ borderColor: 'rgba(160,120,70,0.25)', color: '#6b4e30' }}>
                            Delete
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
