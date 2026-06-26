'use client'
// Client component — exercises the 'use client' directive path through the loader.
import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div style={{ background: '#161925', border: '1px solid #232838', borderRadius: 14, padding: '22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>Interactive widget</h3>
        <p style={{ fontSize: 13, color: '#8a90a6', marginTop: 4 }}>A client component — count is {count}</p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setCount((c) => c - 1)} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #232838', background: '#1d2130', color: '#e6e8ef', fontSize: 18, cursor: 'pointer' }}>−</button>
        <button onClick={() => setCount((c) => c + 1)} style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontSize: 18, cursor: 'pointer' }}>+</button>
      </div>
    </div>
  )
}
