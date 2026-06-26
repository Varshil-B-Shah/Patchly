import type { ReactNode } from 'react'
import { PatchlyReview } from './PatchlyReview'
import './globals.css'

export const metadata = {
  title: 'Nimbus — Next.js Demo',
  description: 'A Patchly Next.js test app',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PatchlyReview />
      </body>
    </html>
  )
}
