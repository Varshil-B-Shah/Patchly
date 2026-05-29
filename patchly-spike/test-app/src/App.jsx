import { useState } from 'react'
import { Hero } from './components/Hero.jsx'
import { StatsCard } from './features/dashboard/components/StatsCard.jsx'

const items = [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
  { id: 3, name: 'Gamma' },
]

export default function App() {
  const [isVisible, setIsVisible] = useState(true)

  return (
    <div className="min-h-screen bg-white">
      <Hero />

      <section className="px-8 py-6">
        <h2 className="text-2xl font-semibold text-gray-800">Edge Case: Conditional</h2>
        <button
          className="mt-2 px-4 py-1 bg-gray-200 rounded"
          onClick={() => setIsVisible(v => !v)}
        >
          Toggle
        </button>
        {isVisible && (
          <div className="mt-4 p-4 bg-yellow-100 rounded">
            Conditional content — this div should have data-patchly-src
          </div>
        )}
      </section>

      <section className="px-8 py-6">
        <h2 className="text-2xl font-semibold text-gray-800">Edge Case: Mapped List</h2>
        <ul className="mt-4 space-y-2">
          {items.map(item => (
            <li key={item.id} className="px-4 py-2 bg-blue-50 rounded">
              {item.name}
            </li>
          ))}
        </ul>
      </section>

      <section className="px-8 py-6">
        <h2 className="text-2xl font-semibold text-gray-800">Edge Case: Deep Path Component</h2>
        <StatsCard title="Revenue" value="$12,400" />
      </section>
    </div>
  )
}
