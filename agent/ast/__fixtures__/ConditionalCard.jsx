export default function ConditionalCard({ show, isError, title }) {
  if (!show) return null
  return (
    <div className={isError ? 'card-error' : 'card-default'}>
      {isError && <span className="error-icon">!</span>}
      <h2 className="card-title">{title}</h2>
    </div>
  )
}
