import { auth, signOut } from '@/lib/auth'
import { connectDb } from '@/lib/db'
import { Project } from '@/lib/models/Project'
import { Comment } from '@/lib/models/Comment'
import Link from 'next/link'
import { createProject } from '@/app/actions'
import { ensureUser } from '@/lib/users'

export default async function DashboardPage() {
  const session = await auth()
  const userId  = session!.user!.id as string

  await ensureUser(session)
  await connectDb()
  // Projects I own OR am a member of.
  const projects = await Project.find({
    $or: [{ ownerId: userId }, { 'members.userId': userId }],
  }).sort({ createdAt: -1 }).lean()

  // Open comment count per project
  const counts = await Promise.all(
    projects.map((p) => Comment.countDocuments({ projectId: p._id, status: 'open' }))
  )

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
          <button className="text-sm text-gray-500 hover:text-gray-700">Sign out</button>
        </form>
      </div>

      {/* Project list */}
      {projects.length === 0 ? (
        <p className="text-gray-500 text-sm">No projects yet. Create one below.</p>
      ) : (
        <div className="space-y-3">
          {projects.map((p, i) => (
            <Link
              key={String(p._id)}
              href={`/dashboard/${p._id}`}
              className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{p.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{p.domains.join(', ') || 'no domains'}</div>
                </div>
                {counts[i] > 0 && (
                  <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {counts[i]} open
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* New project form */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">New project</h2>
        <form action={createProject} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input
              name="name"
              required
              placeholder="Acme App"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Domains (comma-separated)</label>
            <input
              name="domains"
              placeholder="localhost:5173, acme-preview.vercel.app"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <button
            type="submit"
            className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 transition font-medium"
          >
            Create project
          </button>
        </form>
      </div>
    </div>
  )
}
