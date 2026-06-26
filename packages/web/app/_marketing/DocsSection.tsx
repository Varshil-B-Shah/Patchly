const DOCS = [
  {
    title: 'Documentation',
    desc: 'Full setup guide, architecture deep-dive, and protocol reference.',
    link: 'https://github.com/varshil-b-shah/patchly#readme',
    cta: 'Read the README →',
    tape: 'tape rotate-[-3deg] left-5',
  },
  {
    title: 'Community',
    desc: 'Ask questions, share workflows, and report issues with the team.',
    link: 'https://github.com/varshil-b-shah/patchly/discussions',
    cta: 'GitHub Discussions →',
    tape: 'tape-warm tape rotate-[4deg] left-7',
  },
  {
    title: 'Changelog',
    desc: 'See what\'s new in each release — features, fixes, and breaking changes.',
    link: 'https://github.com/varshil-b-shah/patchly/releases',
    cta: 'GitHub Releases →',
    tape: 'tape-cool tape rotate-[-5deg] left-5',
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {DOCS.map(({ title, desc, link, cta, tape }) => (
            <a
              key={title}
              href={link}
              target="_blank"
              rel="noreferrer"
              className="wood-card relative p-7 rounded-sm block group no-underline transition-opacity hover:opacity-90"
            >
              <div className={`absolute -top-1.5 w-11 h-2.5 ${tape}`} />
              <div
                className="text-[1.05rem] mb-2"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--w-cream)' }}
              >
                {title}
              </div>
              <p className="text-[0.82rem] leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>
                {desc}
              </p>
              <span className="text-[0.8rem]" style={{ color: 'rgba(200,168,105,0.75)' }}>{cta}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
