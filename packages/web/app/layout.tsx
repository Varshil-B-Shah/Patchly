import type { ReactNode } from 'react'
import { Special_Elite, Caveat, DM_Sans } from 'next/font/google'
import './globals.css'

const specialElite = Special_Elite({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const caveat = Caveat({
  weight: ['600', '700'],
  subsets: ['latin'],
  variable: '--font-hand',
  display: 'swap',
})

const dmSans = DM_Sans({
  weight: ['300', '400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata = {
  title: 'Patchly — Point. Fix. Ship.',
  description: 'Click any element on your running app. Describe the change. Patchly edits the real source file and hot-reloads instantly.',
  // Self-identify so the extension doesn't mistake this for a user's Next app.
  other: { 'patchly-dashboard': '1' },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${specialElite.variable} ${caveat.variable} ${dmSans.variable}`}
    >
      {/* No bg class here — each route (marketing / dashboard) sets its own background */}
      <body className="min-h-screen antialiased" style={{ fontFamily: 'var(--font-body, DM Sans, sans-serif)' }}>
        {children}
      </body>
    </html>
  )
}
