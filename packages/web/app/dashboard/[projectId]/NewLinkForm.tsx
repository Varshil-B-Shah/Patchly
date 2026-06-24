'use client'
import { useState, useTransition } from 'react'
import { createLink } from '@/app/actions'

export function NewLinkForm({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<{ token: string; shareUrl: string } | null>(null)
  const [pending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    const res = await createLink(projectId, formData)
    if (res && res.token && res.shareUrl) setResult({ token: res.token, shareUrl: res.shareUrl })
  }

  if (result) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2 text-sm">
        <p className="font-semibold text-green-800">Review link created!</p>
        <p className="text-green-700">Share URL: <span className="font-mono break-all">{result.shareUrl}</span></p>
        <p className="text-green-600 text-xs">⚠ Copy the token now — it won&apos;t be shown again.</p>
        <p className="text-green-700">Token: <span className="font-mono">{result.token}</span></p>
        <button onClick={() => setResult(null)} className="text-xs text-green-600 underline">
          Create another
        </button>
      </div>
    )
  }

  return (
    <form
      action={(formData) => startTransition(() => handleSubmit(formData))}
      className="flex flex-wrap gap-3 items-end"
    >
      <div>
        <label className="block text-xs text-gray-500 mb-1">Label</label>
        <input
          name="label"
          required
          placeholder="Client Review - June"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-52"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Expires (optional)</label>
        <input
          name="expiresAt"
          type="date"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 transition font-medium disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Generate link'}
      </button>
    </form>
  )
}
