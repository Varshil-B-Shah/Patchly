export function StatsCard({ title, value }) {
  return (
    <div className="mt-4 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
