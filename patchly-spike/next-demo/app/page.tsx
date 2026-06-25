import { Navbar } from './components/Navbar'
import { StatCard } from './components/StatCard'
import { Counter } from './components/Counter'

export default function Home() {
  return (
    <div>
      <Navbar />
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>

        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800 }}>Deployment overview</h1>
          <p style={{ color: '#8a90a6', marginTop: 6, fontSize: 14 }}>Your infrastructure at a glance — powered by Next.js + Patchly.</p>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          <StatCard label="Requests / min" value="18.2k" delta="9%" up />
          <StatCard label="Avg latency"    value="84ms"  delta="12ms" up />
          <StatCard label="Error rate"     value="0.4%"  delta="0.1%" up={false} />
          <StatCard label="Uptime"         value="99.98%" delta="0.0%" up />
        </div>

        <div style={{ background: 'linear-gradient(135deg,#6366f1 0%,#a855f7 100%)', borderRadius: 16, padding: '30px 34px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 800 }}>Ship faster with edge functions</h2>
            <p style={{ opacity: 0.9, marginTop: 6, fontSize: 14 }}>Deploy globally in seconds with zero cold starts.</p>
          </div>
          <button style={{ background: '#fff', color: '#6366f1', border: 'none', borderRadius: 9, padding: '11px 24px', fontWeight: 800, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Enable edge
          </button>
        </div>

        <Counter />

      </main>
    </div>
  )
}
