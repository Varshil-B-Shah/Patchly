import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
  title: 'Patchly',
  description: 'Patchly review comments',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">{children}</body>
    </html>
  )
}
