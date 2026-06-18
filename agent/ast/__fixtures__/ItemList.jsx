export default function ItemList({ items }) {
  return (
    <ul className="list-disc pl-6">
      {items.map((item) => (
        <li key={item.id} className="text-sm py-1">
          {item.label}
        </li>
      ))}
    </ul>
  )
}
