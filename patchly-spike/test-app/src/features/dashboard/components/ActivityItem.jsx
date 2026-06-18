// A single activity row. Nested inside ActivityFeed → selecting the feed and
// editing a row exercises the parent→child (same-file) targeting.
export function ActivityItem({ user, action, time }) {
  return (
    <li className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-none">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-light text-brand-dark text-sm font-semibold">
        {user[0]}
      </span>
      <div className="flex-1">
        <p className="text-sm text-gray-800">
          <span className="font-medium">{user}</span> {action}
        </p>
        <p className="text-xs text-gray-400">{time}</p>
      </div>
    </li>
  )
}
