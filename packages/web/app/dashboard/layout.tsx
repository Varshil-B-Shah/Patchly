import type { ReactNode } from 'react'

// DashboardShell applies its own wood-floor background.
// This layout is a passthrough — keeping the file so Next.js route groups work.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
