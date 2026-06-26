const BADGES = [
  'Zero telemetry',
  'Full undo / redo',
  '82 regression tests',
  'Vite + Next.js',
  'MCP server included',
  '100% local agent',
]

export function TrustBadges() {
  return (
    <div className="wood-floor py-12 px-6 relative">
      {/* Tape strips spanning full width */}
      <div className="tape absolute inset-x-0 top-6 h-3" style={{ transform: 'rotate(-0.3deg)' }} />
      <div className="tape-cool tape absolute inset-x-0 bottom-6 h-3" style={{ transform: 'rotate(0.2deg)' }} />

      <div className="flex flex-wrap justify-center gap-3 relative z-10">
        {BADGES.map((badge) => (
          <div
            key={badge}
            className="rounded-full px-4 py-2 text-xs flex items-center gap-2"
            style={{
              border: '1px solid rgba(100,75,45,0.22)',
              color: 'var(--text-muted)',
              background: 'rgba(255,255,255,0.025)',
            }}
          >
            {badge}
          </div>
        ))}
      </div>
    </div>
  )
}
