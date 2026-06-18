interface Props<T extends object> {
  items: T[]
  renderItem: (item: T) => unknown
}

export default function GenericList<T extends object>({ items, renderItem }: Props<T>) {
  return (
    <ul className="generic-list">
      {items.map((item, idx) => (
        <li key={idx} className="generic-item">
          {renderItem(item)}
        </li>
      ))}
    </ul>
  )
}
