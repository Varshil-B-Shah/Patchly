import { Navbar } from './components/Navbar.jsx'
import { StatCard } from './components/StatCard.jsx'
import { UserTable } from './components/UserTable.jsx'

export default function App() {
  return (
    <div>
      <Navbar />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* Header */}
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Good morning, Varshil 👋</h1>
          <p style={{ color: '#6b7280', marginTop: 4, fontSize: 14 }}>Here&apos;s what&apos;s happening with your product today.</p>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 16 }}>
          <StatCard label="Monthly Revenue"  value="$24,800"  change="12%"  up />
          <StatCard label="Active Users"     value="3,412"    change="8%"   up />
          <StatCard label="Churn Rate"       value="2.1%"     change="0.3%" up={false} />
          <StatCard label="NPS Score"        value="68"       change="+5"   up />
        </div>

        {/* CTA banner */}
        <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', borderRadius: 14, padding: '28px 32px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Unlock advanced analytics</h2>
            <p style={{ opacity: 0.85, marginTop: 6, fontSize: 14 }}>Get deeper insights into user behaviour and funnel conversion.</p>
          </div>
          <button style={{ background: '#fff', color: '#6366f1', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap' }}>
            Start free trial
          </button>
        </div>

        {/* Users table */}
        <UserTable />

      </main>
    </div>
  )
}
