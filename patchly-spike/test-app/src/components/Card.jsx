// Generic section wrapper: a title plus arbitrary children. Used to nest the
// feature components, so selecting a Card and editing a child exercises the
// cross-file redirect (Card lives here, children live in features/).
export function Card({ title, action, children }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
        {action && <span className="text-sm text-brand hover:text-brand-dark cursor-pointer">{action}</span>}
      </div>
      {children}
    </section>
  )
}
