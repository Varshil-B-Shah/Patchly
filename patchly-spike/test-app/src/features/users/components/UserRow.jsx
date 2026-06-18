import { Badge } from '../../../components/Badge.jsx'

// A table row used many times (drift / multi-select). Imports the shared Badge
// from another feature path — cross-file context test.
export function UserRow({ name, email, role, status }) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-3 text-sm font-medium text-gray-800">{name}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{email}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{role}</td>
      <td className="px-4 py-3 flex justify-center">
        <Badge tone={status === 'Active' ? 'green' : 'gray'}>{status}</Badge>
      </td>
    </tr>
  )
}
