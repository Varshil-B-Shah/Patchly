export function Navbar() {
  return (
    <nav style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>A</div>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Acme Corp</span>
      </div>
      <div style={{ display: 'flex', gap: 24, fontSize: 14, color: '#6b7280' }}>
        <a href="#" style={{ color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>Dashboard</a>
        <a href="#" style={{ textDecoration: 'none', color: 'inherit' }}>Analytics</a>
        <a href="#" style={{ textDecoration: 'none', color: 'inherit' }}>Team</a>
        <a href="#" style={{ textDecoration: 'none', color: 'inherit' }}>Settings</a>
      </div>
      <button style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
        Upgrade Plan
      </button>
    </nav>
  )
}
