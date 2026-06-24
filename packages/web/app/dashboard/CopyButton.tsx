'use client'
import { useState } from 'react'

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="text-xs px-2.5 py-1 rounded border border-gray-300 hover:bg-gray-50 transition text-gray-600"
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}
