import type { ReactNode } from 'react'

// Dashboard routes get the light gray background that the root layout
// no longer provides (it was removed so the marketing page can use its own).
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <div className="bg-gray-50 text-gray-900 min-h-screen">{children}</div>
}
