import { Logo } from './Logo'

export function Footer() {
  return (
    <footer
      className="wood-floor flex items-center justify-between px-8 py-6 flex-wrap gap-4 border-t"
      style={{ borderColor: 'rgba(100,70,40,0.15)' }}
    >
      <Logo size="sm" />

      <span className="text-[0.74rem] opacity-40" style={{ color: 'var(--text-muted)' }}>
        © 2025 Patchly. All rights reserved.
      </span>

      <ul className="flex gap-5 list-none">
        {[
          { href: 'https://github.com/varshil-b-shah/patchly#readme', label: 'Docs' },
          { href: 'https://github.com/varshil-b-shah/patchly', label: 'GitHub' },
          { href: 'https://github.com/varshil-b-shah/patchly/releases', label: 'Changelog' },
        ].map(({ href, label }) => (
          <li key={label}>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-[0.74rem] opacity-45 hover:opacity-85 transition-opacity no-underline"
              style={{ color: 'var(--text-muted)' }}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </footer>
  )
}
