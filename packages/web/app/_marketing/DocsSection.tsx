import Link from 'next/link'

const DOCS = [
  {
    title: 'Quick start',
    desc: 'Install, add the plugin, load the extension. Up in 5 minutes.',
    href: '/docs/getting-started',
    tape: 'tape -rotate-3 left-5',
  },
  {
    title: 'AI Mode',
    desc: 'Click an element, describe the change, review the diff.',
    href: '/docs/ai-mode',
    tape: 'tape-warm tape rotate-3 left-6',
  },
  {
    title: 'Tailwind Mode',
    desc: 'Toggle and search Tailwind classes in a live inspector sidebar.',
    href: '/docs/tailwind-mode',
    tape: 'tape-cool tape -rotate-2 left-5',
  },
  {
    title: 'Comment Mode',
    desc: 'Pin numbered comments, share with clients, fix inline.',
    href: '/docs/comment-mode',
    tape: 'tape rotate-[2deg] left-7',
  },
  {
    title: 'Cloud setup',
    desc: 'MongoDB, GitHub OAuth, UploadThing, and env vars.',
    href: '/docs/cloud-setup',
    tape: 'tape-warm tape -rotate-3 left-5',
  },
  {
    title: 'MCP Server',
    desc: 'Give Claude Code or Copilot eyes on your running browser.',
    href: '/docs/mcp',
    tape: 'tape-cool tape rotate-3 left-6',
  },
]

export function DocsSection() {
  return (
    <section id="docs" className="wood-floor py-20 px-6">
      <div className="max-w-4xl mx-auto">
        <span
          className="block text-center mb-2 tracking-widest text-[0.9rem]"
          style={{ fontFamily: 'var(--font-hand)', color: 'rgba(195,162,105,0.65)' }}
        >
          resources
        </span>
        <h2
          className="text-center mb-14"
          style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem,3.5vw,2.4rem)', color: 'var(--w-cream)', textShadow: '0 3px 16px rgba(0,0,0,.45)' }}
        >
          Everything you need to get started.
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {DOCS.map(({ title, desc, href, tape }) => (
            <Link
              key={href}
              href={href}
              className="wood-card relative p-6 rounded-sm block group no-underline transition-opacity hover:opacity-90"
            >
              <div className={`absolute -top-1.5 w-11 h-2.5 ${tape}`} />
              <div className="text-[1rem] mb-1.5" style={{ fontFamily: 'var(--font-display)', color: 'var(--w-cream)' }}>
                {title}
              </div>
              <p className="text-[0.8rem] leading-relaxed mb-3" style={{ color: 'var(--text-muted)' }}>
                {desc}
              </p>
              <span className="text-[0.78rem]" style={{ color: 'rgba(200,168,105,0.75)' }}>Read more →</span>
            </Link>
          ))}
        </div>

        {/* GitHub issues strip */}
        <div
          className="rounded-sm p-6 border text-center"
          style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(100,75,45,0.2)' }}
        >
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            Bug? Feature request? Feedback? Open an issue on GitHub — all reports are welcome.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <a href="https://github.com/varshil-b-shah/patchly/issues/new?template=bug_report.md" target="_blank" rel="noreferrer"
              className="text-[0.8rem] px-4 py-2 rounded-sm border transition-opacity hover:opacity-80"
              style={{ borderColor: 'rgba(150,110,70,0.3)', color: 'var(--text-muted)' }}>
              Report a bug
            </a>
            <a href="https://github.com/varshil-b-shah/patchly/issues/new?template=feature_request.md" target="_blank" rel="noreferrer"
              className="text-[0.8rem] px-4 py-2 rounded-sm border transition-opacity hover:opacity-80"
              style={{ borderColor: 'rgba(150,110,70,0.3)', color: 'var(--text-muted)' }}>
              Request a feature
            </a>
            <Link href="/docs" className="text-[0.8rem] px-4 py-2 rounded-sm border transition-opacity hover:opacity-80"
              style={{ borderColor: 'rgba(150,110,70,0.3)', color: 'var(--text-muted)' }}>
              Browse all docs
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
