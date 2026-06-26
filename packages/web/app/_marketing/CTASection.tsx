import Link from 'next/link'

export function CTASection({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <section id="install" className="wood-warm relative overflow-hidden py-24 px-6">
      {/* Diagonal tape strips decorating the background */}
      <div className="tape absolute -inset-x-20 top-8 h-5" style={{ transform: 'rotate(10deg)', opacity: 0.5 }} />
      <div className="tape-cool tape absolute -inset-x-20 bottom-8 h-5" style={{ transform: 'rotate(-10deg)', opacity: 0.4 }} />

      <div className="relative z-10 max-w-xl mx-auto text-center">
        <h2
          className="mb-3"
          style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem,5vw,3.3rem)', color: 'var(--w-cream)', textShadow: '0 4px 20px rgba(0,0,0,.45)' }}
        >
          Stick it into your project.
        </h2>
        <p className="mb-8 text-[0.95rem]" style={{ color: 'var(--text-muted)' }}>
          One command. Works with Vite and Next.js. No cloud required.
        </p>

        <div className="mb-8">
          <div
            className="inline-block px-6 py-3 rounded-sm text-[0.92rem] tracking-wide"
            style={{
              fontFamily: 'var(--font-display)',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(140,105,60,0.3)',
              color: 'rgba(210,182,128,0.85)',
              boxShadow: '0 2px 12px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.04)',
            }}
          >
            npx patchly init
          </div>
        </div>

        <div className="flex gap-3 justify-center flex-wrap">
          <a
            href="https://github.com/varshil-b-shah/patchly#readme"
            target="_blank"
            rel="noreferrer"
            className="inline-block px-6 py-3 rounded-sm text-[0.9rem] font-semibold transition-all hover:opacity-90"
            style={{
              background: 'rgba(200,168,100,0.22)',
              border: '1px solid rgba(200,168,100,0.52)',
              color: 'var(--w-cream)',
              backdropFilter: 'blur(6px)',
              boxShadow: '0 4px 16px rgba(0,0,0,.3)',
            }}
          >
            Read the docs →
          </a>
          {!isLoggedIn && (
            <Link
              href="/login"
              className="inline-block px-6 py-3 rounded-sm text-[0.9rem] transition-all border hover:opacity-90"
              style={{ borderColor: 'rgba(150,120,80,0.3)', color: 'var(--text-muted)' }}
            >
              Sign in with GitHub
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
