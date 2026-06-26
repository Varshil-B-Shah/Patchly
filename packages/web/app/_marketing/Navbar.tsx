import Link from 'next/link'
import { Logo } from './Logo'
import { signOut } from '@/lib/auth'

export function Navbar({ isLoggedIn, userName }: { isLoggedIn: boolean; userName?: string | null }) {
  return (
    <nav
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 md:px-10 py-3 border-b border-[rgba(150,110,70,0.12)]"
      style={{ background: 'rgba(20,12,5,0.85)', backdropFilter: 'blur(14px) saturate(1.2)' }}
    >
      <Link href="/" className="shrink-0">
        <Logo size="sm" />
      </Link>

      <ul className="hidden md:flex items-center gap-7 list-none">
        {[
          { href: '#features', label: 'Features' },
          { href: '#how', label: 'How it works' },
          { href: '#review', label: 'Review' },
          { href: '/docs', label: 'Docs' },
          { href: 'https://github.com/varshil-b-shah/patchly', label: 'GitHub', external: true },
        ].map(({ href, label, external }) => (
          <li key={label}>
            <a
              href={href}
              target={external ? '_blank' : undefined}
              rel={external ? 'noreferrer' : undefined}
              className="text-[0.82rem] font-medium tracking-wide transition-opacity opacity-60 hover:opacity-95"
              style={{ color: 'var(--w-pale)', textDecoration: 'none' }}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>

      {isLoggedIn ? (
        <div className="flex items-center gap-4">
          {userName && (
            <span className="hidden sm:block text-[0.82rem] opacity-80" style={{ color: 'var(--w-pale)' }}>
              {userName}
            </span>
          )}
          <Link
            href="/dashboard"
            className="text-[0.82rem] font-semibold px-4 py-2 rounded-sm transition-all duration-200 border"
            style={{
              background: 'rgba(210,178,118,0.18)',
              borderColor: 'rgba(210,178,118,0.4)',
              color: 'var(--w-cream)',
              backdropFilter: 'blur(4px)',
            }}
          >
            Dashboard →
          </Link>
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
            <button
              type="submit"
              className="text-[0.82rem] px-3 py-2 rounded-sm border transition-opacity hover:opacity-80"
              style={{ borderColor: 'rgba(150,110,70,0.25)', color: 'var(--text-muted)' }}
            >
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <Link
          href="/login"
          className="text-[0.82rem] font-semibold px-4 py-2 rounded-sm transition-all duration-200 border hover:opacity-90"
          style={{
            background: 'rgba(210,178,118,0.18)',
            borderColor: 'rgba(210,178,118,0.4)',
            color: 'var(--w-cream)',
            backdropFilter: 'blur(4px)',
          }}
        >
          Sign in
        </Link>
      )}
    </nav>
  )
}
