// Client Review showcase section

const BULLETS = [
  'Share a tunnel URL. No install for reviewers.',
  'Clients leave numbered pins on the real running app.',
  'Pins sync to your extension within 3 seconds.',
  'Fix with AI or tweak classes — all from the same toolbar.',
]

export function ReviewSection() {
  return (
    <section id="review" className="wood-floor py-20 px-6">
      <div className="max-w-4xl mx-auto">
        <span
          className="block text-center mb-2 tracking-widest text-[0.9rem]"
          style={{ fontFamily: 'var(--font-hand)', color: 'rgba(195,162,105,0.65)' }}
        >
          client review
        </span>
        <h2
          className="text-center mb-14"
          style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem,3.5vw,2.4rem)', color: 'var(--w-cream)', textShadow: '0 3px 16px rgba(0,0,0,.45)' }}
        >
          Real-app feedback, not screenshots.
        </h2>

        <div className="grid md:grid-cols-2 gap-10 items-center">
          {/* Visual diagram */}
          <div className="relative p-6 rounded wood-card">
            <div className="tape-warm tape absolute -top-1.5 left-8 w-14 h-3 rotate-[-4deg]" />
            <div className="space-y-4">
              {[
                { label: 'Reviewer', detail: 'Tunnel URL — no install', color: '#7c3aed', icon: '👁' },
                { label: 'Comment pin', detail: 'Numbered, positioned on element', color: '#7c3aed', icon: '①' },
                { label: 'Dev extension', detail: 'Sees pin in real time', color: '#6366f1', icon: '' },
                { label: 'Resolved', detail: 'Fixed with AI or classes', color: '#22c55e', icon: '✓' },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-4">
                  {i > 0 && <div className="absolute ml-5 -mt-5 w-px h-4 bg-white/10" />}
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: `${step.color}20`, border: `1px solid ${step.color}40`, color: step.color }}
                  >
                    {step.icon}
                  </div>
                  <div>
                    <div className="text-[0.88rem] font-medium" style={{ color: 'var(--w-cream)' }}>{step.label}</div>
                    <div className="text-[0.75rem]" style={{ color: 'var(--text-muted)' }}>{step.detail}</div>
                  </div>
                  {i < 3 && (
                    <div className="ml-auto text-white/20 text-xs">↓</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Bullet list */}
          <div>
            <ul className="space-y-5">
              {BULLETS.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'rgba(200,168,105,0.7)' }} />
                  <span className="text-[0.92rem] leading-relaxed" style={{ color: 'var(--w-pale)' }}>{b}</span>
                </li>
              ))}
            </ul>
            <div
              className="mt-8 inline-block px-4 py-2 rounded-sm text-[0.8rem] border"
              style={{
                color: 'var(--w-pale)',
                borderColor: 'rgba(150,120,80,0.35)',
                background: 'rgba(200,168,100,0.10)',
              }}
            >
              Works with cloudflared, ngrok, or any tunnel
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
