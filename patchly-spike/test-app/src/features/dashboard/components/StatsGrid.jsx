import { StatsCard } from './StatsCard.jsx'

// Repeated cards (drift / multi-select) rendered from data.
const stats = [
  { id: 'rev', title: 'Revenue', value: '$12,400', delta: '+12%', trend: 'up' },
  { id: 'users', title: 'Active Users', value: '1,210', delta: '+4%', trend: 'up' },
  { id: 'churn', title: 'Churn', value: '2.1%', delta: '-0.3%', trend: 'down' },
  { id: 'nps', title: 'NPS', value: '64', delta: '+8', trend: 'up' },
]

export function StatsGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map(s => (
        <StatsCard key={s.id} title={s.title} value={s.value} delta={s.delta} trend={s.trend} />
      ))}
    </div>
  )
}
