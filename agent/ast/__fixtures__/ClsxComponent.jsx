import clsx from 'clsx'

export default function Badge({ variant }) {
  return (
    <span className={clsx('badge', { 'badge-primary': variant === 'primary' })}>
      Badge
    </span>
  )
}
