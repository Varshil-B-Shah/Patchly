// Mapped nav with a conditional "active" style — repeated structure for
// multi-select / drift testing.
const nav = [
  { id: 'overview', label: 'Overview', active: true },
  { id: 'users', label: 'Users', active: false },
  { id: 'billing', label: 'Billing', active: false },
  { id: 'settings', label: 'Settings', active: false },
]

export function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-gray-200 bg-surface p-4">
      <nav className="space-y-1">
        {nav.map(item => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`block rounded-lg px-3 py-2 text-sm ${
              item.active ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  )
}
