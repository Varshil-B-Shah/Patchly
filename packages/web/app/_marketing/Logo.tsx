// Logo — the tape-strip "P" on a stacked wood tile pair.
// size: 'sm' (nav/footer) | 'lg' (hero)

type LogoProps = { size?: 'sm' | 'lg'; showWordmark?: boolean }

const SM = { wrap: 52, tile: 44, offset: 8, p: { spine: { l:10, t:9, w:7, h:28 }, top: { l:10, t:9, w:18, h:7 }, mid: { l:10, t:21, w:18, h:7 }, bump: { l:20, t:9, w:7, h:19 } } }
const LG = { wrap: 110, tile: 94, offset: 14, p: { spine: { l:19, t:13, w:13, h:62 }, top: { l:19, t:13, w:40, h:13 }, mid: { l:19, t:48, w:40, h:13 }, bump: { l:46, t:13, w:13, h:48 } } }

const TAPE_STRIP = `repeating-linear-gradient(90deg,rgba(255,255,255,.04) 0,rgba(255,255,255,.04) 1px,transparent 1px,transparent 4px),linear-gradient(180deg,rgba(225,200,148,.13) 0%,rgba(210,180,122,.44) 22%,rgba(214,184,126,.46) 78%,rgba(224,198,145,.13) 100%)`
const TAPE_BUMP  = `repeating-linear-gradient(90deg,rgba(255,255,255,.03) 0,rgba(255,255,255,.03) 1px,transparent 1px,transparent 4px),linear-gradient(180deg,rgba(210,195,162,.12) 0%,rgba(192,175,142,.38) 20%,rgba(196,180,146,.40) 80%,rgba(208,192,158,.12) 100%)`
const TAPE_SHADOW = '0 1px 3px rgba(0,0,0,.14), inset 0 1px 0 rgba(255,255,255,.2), inset 0 -1px 0 rgba(0,0,0,.07)'
const TILE_BG = `radial-gradient(ellipse 80% 55% at 28% 22%,#d4a060 0%,transparent 50%),radial-gradient(ellipse 60% 50% at 70% 75%,#5e3a1c 0%,transparent 55%),linear-gradient(150deg,#b07840 0%,#7a4e28 55%,#5a3418 100%)`
const TILE_SHADOW = (lg: boolean) => lg
  ? '0 5px 0 #3a2410,0 8px 0 #251608,0 14px 30px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.1)'
  : '0 3px 0 #3a2410,0 5px 0 #2a1a08,0 7px 12px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.12)'

export function Logo({ size = 'sm', showWordmark = true }: LogoProps) {
  const d = size === 'lg' ? LG : SM
  const lg = size === 'lg'
  const br = lg ? '7px' : '4px'
  const p = d.p

  const tileStyle = (rotate: string, top: number, left: number): React.CSSProperties => ({
    position: 'absolute', width: d.tile, height: d.tile, top, left,
    borderRadius: br,
    background: TILE_BG,
    boxShadow: TILE_SHADOW(lg),
    transform: `rotate(${rotate})`,
  })

  const stripStyle = (b: { l:number; t:number; w:number; h:number }, tape = TAPE_STRIP): React.CSSProperties => ({
    position: 'absolute', left: b.l, top: b.t, width: b.w, height: b.h,
    background: tape, boxShadow: TAPE_SHADOW,
  })

  return (
    <div className="flex items-center gap-3">
      <div style={{ position: 'relative', width: d.wrap, height: d.wrap, flexShrink: 0 }}>
        <div style={tileStyle('-4deg', 0, 0)} />
        <div style={tileStyle('2.5deg', d.offset, d.offset)} />
        {/* The tape-strip P */}
        <div style={{ position: 'absolute', top: d.offset, left: d.offset, width: d.tile, height: d.tile, transform: 'rotate(2.5deg)', zIndex: 5 }}>
          <div style={stripStyle(p.spine)} />
          <div style={stripStyle(p.top)} />
          <div style={stripStyle(p.mid)} />
          <div style={stripStyle(p.bump, TAPE_BUMP)} />
        </div>
      </div>
      {showWordmark && (
        <span
          className={lg ? 'text-5xl' : 'text-[1.75rem]'}
          style={{ fontFamily: 'var(--font-display, Special Elite, serif)', color: 'var(--w-cream)', letterSpacing: '0.02em', textShadow: '0 2px 8px rgba(0,0,0,.5)', lineHeight: 1 }}
        >
          Patchly
        </span>
      )}
    </div>
  )
}
