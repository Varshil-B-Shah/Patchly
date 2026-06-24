import { auth } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { Project } from '@/lib/models/Project'
import { Comment } from '@/lib/models/Comment'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { resolveComment, deleteComment, clearResolved } from '@/app/actions'

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
  if (!project || project.ownerId !== userId) notFound()

  const status = (rawStatus ?? 'open') as 'open' | 'resolved' | 'all'
  const filter: Record<string, unknown> = { projectId: project._id }
  if (status !== 'all') filter.status = status
  const rawDocs = await Comment.find(filter).sort({ createdAt: -1 }).lean()
  // Serialize inline — avoids the lean() FlattenMaps vs CommentDoc type mismatch
  const docs = rawDocs.map((d) => ({
    id: String(d._id),
    note: d.note,
    authorDisplayName: d.authorDisplayName,
    tag: d.tag ?? undefined,
    componentName: d.componentName ?? undefined,
    patchlySrc: d.patchlySrc ?? undefined,
    pageUrl: d.pageUrl,
    screenshot: d.screenshot as { url: string; key: string } | undefined,
    status: d.status as 'open' | 'resolved',
    createdAt: (d.createdAt as Date).toISOString(),
  }))

  const resolvedCount = await Comment.countDocuments({ projectId: project._id, status: 'resolved' })

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-gray-700">Projects</Link>
        <span>›</span>
        <Link href={`/dashboard/${projectId}`} className="hover:text-gray-700">{project.name}</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">Comments</span>
      </div>

      {/* Header + filter tabs + clear button */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg text-sm">
          {(['open', 'resolved', 'all'] as const).map((s) => (
            <Link
              key={s}
              href={`/dashboard/${projectId}/comments?status=${s}`}
              className={`px-3 py-1 rounded-md transition font-medium capitalize ${
                status === s ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s}
            </Link>
          ))}
        </div>
        {resolvedCount > 0 && (
          <form action={clearResolved.bind(null, projectId)}>
            <button className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition">
              Clear {resolvedCount} resolved
            </button>
          </form>
        )}
      </div>

      {/* Comment list */}
      {docs.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-12">No {status === 'all' ? '' : status} comments.</p>
      ) : (
        <div className="space-y-3">
          {docs.map((c) => {
            const path = (() => { try { return new URL(c.pageUrl).pathname } catch { return c.pageUrl } })()
            return (
              <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1 min-w-0">
                    {/* Note */}
                    <p className="text-gray-900 text-sm leading-relaxed">{c.note}</p>
                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-400">
                      <span className="font-medium text-gray-600">{c.authorDisplayName}</span>
                      {c.tag && <span className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">&lt;{c.tag}&gt;</span>}
                      {c.componentName && <span className="text-gray-500">{c.componentName}</span>}
                      <a href={c.pageUrl} target="_blank" rel="noreferrer" className="hover:text-indigo-500 truncate max-w-xs">
                        {path}
                      </a>
                      <span>·</span>
                      <span>{relTime(c.createdAt)}</span>
                      {c.status === 'resolved' && (
                        <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">Resolved</span>
                      )}
                    </div>
                  </div>
                  {/* Screenshot thumbnail */}
                  {c.screenshot?.url && (
                    <img
                      src={c.screenshot.url}
                      alt=""
                      className="w-20 h-14 object-cover rounded-lg border border-gray-100 shrink-0"
                    />
                  )}
                </div>

                {/* Actions */}
                {c.status === 'open' && (
                  <div className="flex gap-2 pt-1">
                    <form action={resolveComment.bind(null, projectId, c.id)}>
                      <button className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium">
                        Resolve
                      </button>
                    </form>
                    <form action={deleteComment.bind(null, projectId, c.id)}>
                      <button className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition">
                        Delete
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
