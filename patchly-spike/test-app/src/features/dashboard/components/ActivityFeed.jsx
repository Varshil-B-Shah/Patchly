import { ActivityItem } from './ActivityItem.jsx'

const activity = [
  { id: 1, user: 'Priya', action: 'closed the Q2 report', time: '2m ago' },
  { id: 2, user: 'Marcus', action: 'invited a new teammate', time: '1h ago' },
  { id: 3, user: 'Lena', action: 'updated billing settings', time: '3h ago' },
  { id: 4, user: 'Sam', action: 'exported the user list', time: 'Yesterday' },
]

export function ActivityFeed() {
  return (
    <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
      <h3 className="text-lg font-semibold text-gray-800">Recent Activity</h3>
      <ul className="mt-2">
        {activity.map(a => (
          <ActivityItem key={a.id} user={a.user} action={a.action} time={a.time} />
        ))}
      </ul>
    </div>
  )
}
