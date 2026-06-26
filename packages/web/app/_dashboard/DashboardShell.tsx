// Shared shell for all dashboard pages — dark wood bg, top nav strip, content in paper card.
import Link from 'next/link'
import { Logo } from '../_marketing/Logo'
import { signOut } from '@/lib/auth'

interface Props {
  children: React.ReactNode
  breadcrumb?: { label: string; href?: string }[]
  userName?: string | null
}

export function DashboardShell({ children, breadcrumb, userName }: Props) {
  return (
    <div className="wood-floor min-h-screen" style={{ fontFamily: 'var(--font-body)' }}>
      {/* Top navigation */}
      <nav
        className="flex items-center justify-between px-6 py-3 border-b"
        style={{ background: 'rgba(20,12,5,0.9)', borderColor: 'rgba(150,110,70,0.12)', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex items-center gap-6">
          <Link href="/dashboard">
            <Logo size="sm" />
          </Link>
          {breadcrumb && breadcrumb.length > 0 && (
            <ol className="hidden sm:flex items-center gap-1.5 list-none" style={{ color: 'var(--text-muted)' }}>
              {breadcrumb.map((b, i) => (
                <li key={i} className="flex items-center gap-1.5 text-[0.78rem]">
                  {i > 0 && <span className="opacity-40">›</span>}
                  {b.href ? (
                    <Link href={b.href} className="hover:opacity-80 transition-opacity" style={{ color: 'var(--w-pale)' }}>
                      {b.label}
                    </Link>
                  ) : (
                    <span style={{ color: 'var(--w-pale)', fontWeight: 500 }}>{b.label}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex items-center gap-4">
          {userName && (
            <span className="hidden sm:block text-[0.78rem]" style={{ color: 'var(--text-muted)' }}>
              {userName}
            </span>
          )}
          <Link href="/docs" className="text-[0.78rem] opacity-60 hover:opacity-90 transition-opacity" style={{ color: 'var(--w-pale)' }}>
            Docs
          </Link>
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
            <button
              type="submit"
              className="text-[0.78rem] px-3 py-1.5 rounded-sm border transition-opacity hover:opacity-80"
              style={{ borderColor: 'rgba(150,110,70,0.25)', color: 'var(--text-muted)' }}
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>

      {/* Page content */}
      <main className="max-w-3xl mx-auto py-10 px-4">
        {children}
      </main>
    </div>
  )
}

// Reusable styled paper card for dashboard sections
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`paper rounded-sm shadow-md relative ${className}`}>
      <div className="px-7 py-6">{children}</div>
    </div>
  )
}

// Section title inside a card
export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-semibold mb-4 text-[0.95rem]" style={{ fontFamily: 'var(--font-display)', color: '#2a1c0e' }}>
      {children}
    </h2>
  )
}
