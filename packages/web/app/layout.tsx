import type { ReactNode } from 'react'

export const metadata = {
  title: 'Patchly',
  description: 'Patchly review comments',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
