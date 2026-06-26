// Server component — renders in SSR HTML, gets data-patchly-src at build time.
export function Navbar() {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', height: 64, borderBottom: '1px solid #1e2230', background: '#12141c' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>N</div>
        <span style={{ fontWeight: 700, fontSize: 17 }}>Nimbus</span>
      </div>
      <div style={{ display: 'flex', gap: 26, fontSize: 14, color: '#9aa0b4' }}>
        <a href="#" style={{ color: '#c7cbff', fontWeight: 600 }}>Overview</a>
        <a href="#">Deployments</a>
        <a href="#">Logs</a>
        <a href="#">Billing</a>
      </div>
      <button style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
        New Project
      </button>
    </nav>
  )
}
