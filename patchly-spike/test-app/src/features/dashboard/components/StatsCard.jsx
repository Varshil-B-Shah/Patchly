import { Badge } from '../../../components/Badge.jsx'

export function StatsCard({ title, value, delta, trend = 'up' }) {
  return (
    <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{title}</p>
        <Badge tone={trend === 'up' ? 'green' : 'red'}>{delta}</Badge>
      </div>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
