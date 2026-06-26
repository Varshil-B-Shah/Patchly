'use client'
import { useState, useTransition } from 'react'
import { createLink } from '@/app/actions'

const inputStyle = { borderColor: 'rgba(160,120,70,0.35)', background: 'rgba(255,248,235,0.85)', color: '#2a1c0e' }

export function NewLinkForm({ projectId }: { projectId: string }) {
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  function generate() {
    startTransition(async () => {
      const res = await createLink(projectId)
      if (res?.token) setToken(res.token)
    })
  }

  function copy() {
    if (!token) return
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  if (token) {
    return (
      <div className="space-y-3">
        <p className="text-xs" style={{ color: '#6b4e30' }}>
          Copy this token now — it won't be shown again.
          Add it to your app's <code className="font-mono">.env.local</code> as{' '}
          <code className="font-mono">PATCHLY_REVIEW_TOKEN</code>.
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={token}
            className="flex-1 border rounded px-3 py-2 text-xs font-mono focus:outline-none"
            style={{ ...inputStyle, color: '#5a3010' }}
          />
          <button
            onClick={copy}
            className="px-4 py-2 rounded-sm text-xs font-semibold transition-opacity hover:opacity-80 whitespace-nowrap"
            style={{ background: 'rgba(200,168,100,0.22)', border: '1px solid rgba(200,168,100,0.45)', color: '#2a1c0e' }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <button onClick={() => setToken(null)} className="text-xs underline" style={{ color: '#8a6a44' }}>
          Generate another
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={generate}
      disabled={pending}
      className="px-5 py-2 rounded-sm text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
      style={{ background: 'rgba(200,168,100,0.22)', border: '1px solid rgba(200,168,100,0.45)', color: '#2a1c0e' }}
    >
      {pending ? 'Generating…' : 'Generate review token'}
    </button>
  )
}
