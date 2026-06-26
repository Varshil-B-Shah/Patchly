import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
  title: 'Patchly',
  description: 'Patchly review comments',
  // Self-identify the dashboard so the extension doesn't mistake it for a user's
  // Next app (both run on localhost:3000). content.ts checks this meta tag.
  other: { 'patchly-dashboard': '1' },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">{children}</body>
    </html>
  )
}
