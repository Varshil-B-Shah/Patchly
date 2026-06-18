import { useState } from 'react'
import { Navbar } from './components/Navbar.jsx'
import { Sidebar } from './components/Sidebar.jsx'
import { Footer } from './components/Footer.jsx'
import { Card } from './components/Card.jsx'
import { StatsGrid } from './features/dashboard/components/StatsGrid.jsx'
import { ActivityFeed } from './features/dashboard/components/ActivityFeed.jsx'
import { UserTable } from './features/users/components/UserTable.jsx'
import { SettingsPanel } from './features/settings/components/SettingsPanel.jsx'

export default function App() {
  const [showBanner, setShowBanner] = useState(true)

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Navbar />

      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 p-8 space-y-8">
          {/* Conditional render — should still carry data-patchly-src */}
          {showBanner && (
            <div className="flex items-center justify-between rounded-xl bg-brand-light px-4 py-3 text-sm text-brand-dark">
              <span>Welcome back — you have 3 new reports to review.</span>
              <button onClick={() => setShowBanner(false)} className="font-medium hover:underline">
                Dismiss
              </button>
            </div>
          )}

          <Card title="Overview" action="View all">
            <StatsGrid />
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card title="Activity">
              <ActivityFeed />
            </Card>

            <Card title="Settings">
              <SettingsPanel />
            </Card>
          </div>

          <Card title="Team Members" action="Invite">
            <UserTable />
          </Card>
        </main>
      </div>

      <Footer />
    </div>
  )
}
