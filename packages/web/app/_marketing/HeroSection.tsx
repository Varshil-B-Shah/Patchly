'use client'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Logo } from './Logo'

// Each hero child animates up with a staggered delay via the `custom` prop.
function fadeUpVariants(i: number) {
  return {
    hidden: { opacity: 0, y: 22 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.12, ease: 'easeOut' as const } },
  }
}

// Tape decoration strips — scattered at various angles
const TAPES: { top?: string; bottom?: string; left?: string; right?: string; width: string; height: string; rotate: string; cls: string }[] = [
  { top: '90px',  left: '-20px', width: '140px', height: '16px', rotate: '-9deg',  cls: 'tape' },
  { top: '150px', left: '50px',  width: '65px',  height: '12px', rotate: '5deg',   cls: 'tape-cool tape' },
  { top: '110px', right: '30px', width: '110px', height: '15px', rotate: '7deg',   cls: 'tape-warm tape' },
  { top: '185px', right: '90px', width: '50px',  height: '11px', rotate: '-4deg',  cls: 'tape-cool tape' },
  { bottom: '200px', left: '40px',  width: '80px',  height: '14px', rotate: '-13deg', cls: 'tape-warm tape' },
  { bottom: '130px', left: '110px', width: '42px',  height: '10px', rotate: '8deg',   cls: 'tape' },
  { bottom: '210px', right: '60px', width: '120px', height: '15px', rotate: '11deg',  cls: 'tape-cool tape' },
  { bottom: '145px', right: '160px',width: '45px',  height: '11px', rotate: '-6deg',  cls: 'tape' },
  { top: '290px',  left: '70px',  width: '12px',  height: '65px', rotate: '3deg',   cls: 'tape-warm tape' },
]

export function HeroSection({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <section className="wood-floor relative min-h-screen flex items-center justify-center overflow-hidden px-6 pt-32 pb-24">
      {/* Scattered tape strips */}
      {TAPES.map((t, i) => (
        <div
          key={i}
          className={`absolute pointer-events-none ${t.cls}`}
          style={{ top: t.top, bottom: t.bottom, left: t.left, right: t.right, width: t.width, height: t.height, transform: `rotate(${t.rotate})` }}
        />
      ))}

      <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto">
        <motion.div variants={fadeUpVariants(0)} initial="hidden" animate="show" className="mb-10">
          <Logo size="lg" showWordmark={false} />
        </motion.div>

        <motion.span
          variants={fadeUpVariants(1)} initial="hidden" animate="show"
          className="block mb-4 tracking-widest text-[0.95rem]"
          style={{ fontFamily: 'var(--font-hand)', color: 'rgba(210,182,128,0.7)' }}
        >
          introducing Patchly
        </motion.span>

        <motion.h1
          variants={fadeUpVariants(2)} initial="hidden" animate="show"
          className="mb-6 leading-[1.08]"
          style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.6rem,6vw,4.6rem)', color: 'var(--w-cream)', textShadow: '0 4px 24px rgba(0,0,0,.6)' }}
        >
          Point.{' '}
          <span className="tape-underline">Fix.</span>
          <br />
          Ship.
        </motion.h1>

        <motion.p
          variants={fadeUpVariants(3)} initial="hidden" animate="show"
          className="mb-10 max-w-lg leading-relaxed opacity-75 text-[1.05rem]"
          style={{ color: 'var(--w-pale)' }}
        >
          Click any element on your running app, describe what you want,
          and Patchly edits the real source file and not the DOM.
          No file hunting. No className archaeology.
        </motion.p>

        <motion.div variants={fadeUpVariants(4)} initial="hidden" animate="show" className="flex gap-3 flex-wrap justify-center">
          <Link
            href={isLoggedIn ? '/dashboard' : '/login'}
            className="inline-block px-7 py-3 rounded-sm text-[0.9rem] font-semibold transition-all duration-200 hover:-translate-y-0.5"
            style={{
              background: 'rgba(200,168,100,0.22)',
              border: '1px solid rgba(200,168,100,0.52)',
              color: 'var(--w-cream)',
              backdropFilter: 'blur(6px)',
              boxShadow: '0 4px 16px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.08)',
            }}
          >
            {isLoggedIn ? 'Open Dashboard →' : 'Try it free →'}
          </Link>
          <a
            href="https://github.com/varshil-b-shah/patchly"
            target="_blank"
            rel="noreferrer"
            className="inline-block px-7 py-3 rounded-sm text-[0.9rem] transition-all duration-200 border hover:opacity-90"
            style={{ borderColor: 'rgba(150,120,80,0.3)', color: 'var(--text-muted)' }}
          >
            View on GitHub
          </a>
        </motion.div>
      </div>
    </section>
  )
}
