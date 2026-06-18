interface NavBarProps {
  brand: string
  links: string[]
}

export default function NavBar({ brand, links }: NavBarProps) {
  return (
    <nav className="flex items-center justify-between p-4">
      <a href="/" className="text-xl font-bold">
        {brand}
      </a>
    </nav>
  )
}
