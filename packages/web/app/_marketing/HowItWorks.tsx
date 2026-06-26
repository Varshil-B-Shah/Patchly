// Static — no client JS needed

const STEPS = [
  { n: '1', title: 'See it in the browser', sub: 'Your live app at localhost' },
  { n: '2', title: 'Click the element', sub: 'Patchly pinpoints the source' },
  { n: '3', title: 'Describe the change', sub: 'Plain English prompt' },
  { n: '4', title: 'File saved. App reloads.', sub: 'Permanent. Undoable. Done.' },
]

export function HowItWorks() {
  return (
    <section id="how" className="wood-floor py-20 px-6">
      <div className="max-w-3xl mx-auto wood-board rounded p-10 relative">
        {/* Top tape strip */}
        <div className="tape absolute inset-x-14 -top-2 h-4" />
        {/* Nail corners */}
        {['top-3 left-3', 'top-3 right-3', 'bottom-3 left-3', 'bottom-3 right-3'].map((pos) => (
          <div
            key={pos}
            className={`absolute ${pos} w-2.5 h-2.5 rounded-full z-10`}
            style={{ background: 'radial-gradient(circle at 38% 32%,#c8b89a,#6e5840)', boxShadow: '0 1px 3px rgba(0,0,0,.5),inset 0 1px 1px rgba(255,255,255,.22)' }}
          />
        ))}

        <span
          className="block mb-1 tracking-widest text-[0.88rem]"
          style={{ fontFamily: 'var(--font-hand)', color: 'rgba(195,162,105,0.65)' }}
        >
          how it works
        </span>
        <h2
          className="mb-10 text-[1.7rem]"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--w-cream)', textShadow: '0 3px 16px rgba(0,0,0,.45)' }}
        >
          Four steps from sight to source.
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 relative z-10">
          {STEPS.map((step, i) => (
            <div key={step.n} className="text-center relative">
              {i > 0 && (
                <span
                  className="absolute -left-4 top-5 hidden sm:block text-base"
                  style={{ color: 'rgba(195,162,105,0.4)' }}
                >→</span>
              )}
              <span
                className="block leading-none mb-2"
                style={{ fontFamily: 'var(--font-hand)', fontSize: '2.2rem', color: 'rgba(200,168,105,0.55)' }}
              >
                {step.n}
              </span>
              <div className="text-[0.95rem] mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--w-cream)', lineHeight: 1.4 }}>
                {step.title}
              </div>
              <div className="text-[0.74rem] opacity-80" style={{ color: 'var(--text-muted)' }}>
                {step.sub}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
