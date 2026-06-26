const AUDIENCE = [
  {
    role: 'Developers',
    body: 'Stop alt-tabbing between browser and editor. Click the element, type what you want, the file saves before you finish the sentence.',
    tape: 'tape rotate-[-2.5deg] left-5',
  },
  {
    role: 'Designers',
    body: 'Tweak spacing, colors, and Tailwind classes without knowing which JSX file you\'re in. The inspector shows exactly what changed.',
    tape: 'tape-warm tape rotate-[3deg] left-6',
  },
  {
    role: 'Clients',
    body: 'Leave numbered pins on the real running app — not screenshots, not Figma. No install required. Your feedback lands directly in the queue.',
    tape: 'tape-cool tape rotate-[-4deg] left-5',
  },
]

export function AudienceSection() {
  return (
    <section id="for-who" className="wood-floor py-20 px-6">
      <div className="max-w-4xl mx-auto">
        <span
          className="block text-center mb-2 tracking-widest text-[0.9rem]"
          style={{ fontFamily: 'var(--font-hand)', color: 'rgba(195,162,105,0.65)' }}
        >
          who it's for
        </span>
        <h2
          className="text-center mb-14"
          style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem,3.5vw,2.4rem)', color: 'var(--w-cream)', textShadow: '0 3px 16px rgba(0,0,0,.45)' }}
        >
          Built for the whole team.
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {AUDIENCE.map(({ role, body, tape }) => (
            <div
              key={role}
              className="relative rounded-sm p-7 border"
              style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(100,75,45,0.2)' }}
            >
              <div className={`absolute -top-1.5 w-11 h-2.5 ${tape}`} />
              <div
                className="text-2xl mb-3"
                style={{ fontFamily: 'var(--font-hand)', color: 'rgba(210,182,128,0.8)' }}
              >
                {role}
              </div>
              <p className="text-[0.84rem] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
