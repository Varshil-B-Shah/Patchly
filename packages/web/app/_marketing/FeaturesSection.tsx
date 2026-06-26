'use client'
import { motion } from 'framer-motion'
import { useInView } from 'framer-motion'
import { useRef } from 'react'

const FEATURES = [
  {
    title: 'Click-to-edit',
    desc: 'Source-mapped to the exact file, line, and column. No guessing which component renders what.',
    tape: 'rotate-[-4deg] left-5',
  },
  {
    title: 'AI Mode',
    desc: 'AST edits, never a string replace. Diff preview with a confidence score before anything is written.',
    tape: 'rotate-[3deg] left-8',
    tapeCls: 'tape-warm',
  },
  {
    title: 'Tailwind Mode',
    desc: 'Direct class inspector — toggle, search, and add Tailwind classes in a sidebar. No AI, instant writes.',
    tape: 'rotate-[-5deg] left-6',
    tapeCls: 'tape-cool',
  },
  {
    title: 'Client Review',
    desc: 'Share a tunnel URL. Clients leave numbered pins on the real running app. No install required.',
    tape: 'rotate-[4deg] left-5',
  },
  {
    title: 'Safe by design',
    desc: 'Drift guard, syntax check, full undo. Confined to your project — never touches node_modules or config files.',
    tape: 'rotate-[-3deg] left-7',
    tapeCls: 'tape-warm',
  },
  {
    title: 'HMR-native',
    desc: 'Vite and Next.js out of the box. The moment Patchly writes the file, your dev server hot-reloads.',
    tape: 'rotate-[5deg] left-5',
    tapeCls: 'tape-cool',
  },
]

function FeatureCard({ title, desc, tape, tapeCls = 'tape', i }: (typeof FEATURES)[0] & { i: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay: (i % 3) * 0.08, ease: 'easeOut' }}
      className="wood-card p-8 relative"
    >
      {/* Tape pin at top-left */}
      <div className={`absolute -top-1.5 w-12 h-3 ${tape} ${tapeCls} tape`} />
      <h3
        className="mb-2 text-[1.1rem]"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--w-cream)' }}
      >
        {title}
      </h3>
      <p className="text-[0.85rem] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {desc}
      </p>
    </motion.div>
  )
}

export function FeaturesSection() {
  return (
    <section id="features" className="wood-floor py-20 px-6 relative">
      <div className="max-w-5xl mx-auto">
        <span
          className="block text-center mb-2 tracking-widest text-[0.9rem]"
          style={{ fontFamily: 'var(--font-hand)', color: 'rgba(195,162,105,0.65)' }}
        >
          what it does
        </span>
        <h2
          className="text-center mb-14"
          style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem,3.5vw,2.6rem)', color: 'var(--w-cream)', textShadow: '0 3px 16px rgba(0,0,0,.45)' }}
        >
          Everything you need. Nothing you don't.
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0.5">
          {FEATURES.map((f, i) => <FeatureCard key={f.title} {...f} i={i} />)}
        </div>
      </div>
    </section>
  )
}
