export function Navbar() {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white font-bold">P</span>
        <span className="text-lg font-semibold text-gray-800">Patchly Admin</span>
      </div>

      <nav className="hidden gap-6 md:flex">
        <a href="/" className="text-sm text-gray-600 hover:text-brand">Dashboard</a>
        <a href="/users" className="text-sm text-gray-600 hover:text-brand">Users</a>
        <a href="/settings" className="text-sm text-gray-600 hover:text-brand">Settings</a>
      </nav>

      <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
        New report
      </button>
    </header>
  )
}
