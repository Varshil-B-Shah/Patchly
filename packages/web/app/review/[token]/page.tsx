import { connectDb } from '@/lib/db'
import { ReviewLink } from '@/lib/models/ReviewLink'
import { Project } from '@/lib/models/Project'
import { notFound } from 'next/navigation'

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  await connectDb()

  const link = await ReviewLink.findOne({ token }).lean()
  if (!link || link.revokedAt) notFound()
  if (link.expiresAt && link.expiresAt < new Date()) notFound()

  const project = await Project.findById(link.projectId).lean()
  if (!project) notFound()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const scriptTag = `<script src="${appUrl}/patchly-overlay.js"\n        data-patchly-token="${token}"></script>`

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-lg w-full space-y-6 shadow-sm">
        <div>
          <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">Review link</div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <p className="text-sm text-gray-500 mt-1">Review — {link.label}</p>
        </div>

        <p className="text-sm text-gray-600">
          To leave comments on the preview app, add this script tag to the app&apos;s{' '}
          <code className="bg-gray-100 px-1 rounded text-xs">index.html</code> and open it in your browser:
        </p>

        <pre className="bg-gray-900 text-green-400 text-xs rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-all">
          {scriptTag}
        </pre>

        <p className="text-xs text-gray-400">
          Once the script is loaded, a purple <strong>+</strong> button will appear. Click it to start leaving comments on any element.
        </p>
      </div>
    </div>
  )
}
