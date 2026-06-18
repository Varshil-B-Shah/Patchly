import { UserRow } from './UserRow.jsx'

const users = [
  { id: 1, name: 'Priya Sharma', email: 'priya@acme.co', role: 'Admin', status: 'Active' },
  { id: 2, name: 'Marcus Lee', email: 'marcus@acme.co', role: 'Editor', status: 'Active' },
  { id: 3, name: 'Lena Ortiz', email: 'lena@acme.co', role: 'Viewer', status: 'Invited' },
  { id: 4, name: 'Sam Okafor', email: 'sam@acme.co', role: 'Editor', status: 'Active' },
  { id: 5, name: 'Yuki Tanaka', email: 'yuki@acme.co', role: 'Viewer', status: 'Suspended' },
]

export function UserTable() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-left">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Email</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Role</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <UserRow key={u.id} name={u.name} email={u.email} role={u.role} status={u.status} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
