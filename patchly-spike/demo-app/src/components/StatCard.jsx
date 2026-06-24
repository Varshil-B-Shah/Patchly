export function StatCard({ label, value, change, up = true }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px', flex: 1 }} className="">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="hidden">
        <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: up ? '#d1fae5' : '#fee2e2', color: up ? '#065f46' : '#991b1b' }}>
          {up ? '+' : ''}{change}
        </span>
      </div>
      <p style={{ fontSize: 28, fontWeight: 700, marginTop: 10 }} className="">{value}</p>
    </div>
  )
}
