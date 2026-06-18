// Shared UI badge. Imported across features (dashboard + users) via a deep
// relative path — good for testing cross-file context resolution.
export function Badge({ children, tone = 'green' }) {
  const tones = {
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    gray: 'bg-gray-100 text-gray-600',
    brand: 'bg-brand-light text-brand-dark',
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}
