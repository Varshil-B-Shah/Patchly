const users = [
  { name: 'Priya Sharma',  email: 'priya@acme.com',  role: 'Admin',   status: 'Active' },
  { name: 'Marcus Lee',    email: 'marcus@acme.com',  role: 'Editor',  status: 'Active' },
  { name: 'Lena Müller',   email: 'lena@acme.com',   role: 'Viewer',  status: 'Inactive' },
  { name: 'Sam Okafor',    email: 'sam@acme.com',    role: 'Editor',  status: 'Active' },
  { name: 'Jana Novak',    email: 'jana@acme.com',   role: 'Viewer',  status: 'Active' },
]

export function UserTable() {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>Team Members</h2>
        <button style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
          Invite member
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: '#f9fafb' }}>
            <th style={{ padding: '12px 24px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: 12 }}>Name</th>
            <th style={{ padding: '12px 24px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: 12 }}>Email</th>
            <th style={{ padding: '12px 24px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: 12 }}>Role</th>
            <th style={{ padding: '12px 24px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: 12 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.email} style={{ borderTop: '1px solid #f3f4f6' }}>
              <td style={{ padding: '14px 24px', fontWeight: 500 }}>{u.name}</td>
              <td style={{ padding: '14px 24px', color: '#6b7280' }}>{u.email}</td>
              <td style={{ padding: '14px 24px', color: '#374151' }}>{u.role}</td>
              <td style={{ padding: '14px 24px' }}>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: u.status === 'Active' ? '#d1fae5' : '#f3f4f6', color: u.status === 'Active' ? '#065f46' : '#9ca3af' }}>
                  {u.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
