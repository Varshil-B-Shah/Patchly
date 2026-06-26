export function StatCard({ label, value, delta, up = true }: { label: string; value: string; delta: string; up?: boolean }) {
  return (
    <div style={{ flex: 1, background: '#161925', border: '1px solid #232838', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#8a90a6' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: up ? '#10331f' : '#3a1620', color: up ? '#4ade80' : '#f87171' }}>
          {up ? '▲' : '▼'} {delta}
        </span>
      </div>
      <p style={{ fontSize: 30, fontWeight: 800, marginTop: 12 }} className="">{value}</p>
    </div>
  )
}
