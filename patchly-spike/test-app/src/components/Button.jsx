export function Button({ label }) {
  return (
    <button className="lg:inline-flex mt-6 px-6 py-2 text-white rounded-lg bg-pink-500 hover:bg-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:ring-offset-2 shadow-sm relative overflow-hidden">
        <span aria-hidden="true" className="pointer-events-none absolute inset-0">
          <svg className="absolute -top-2 -left-2 h-10 w-10 opacity-30" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M32 6C24 16 18 26 18 36c0 10 6 18 14 18s14-8 14-18C46 26 40 16 32 6Z" fill="white"/>
            <path d="M32 10c-5 8-9 16-9 24 0 8 4 14 9 14s9-6 9-14c0-8-4-16-9-24Z" fill="white" opacity="0.55"/>
          </svg>
          <svg className="absolute -bottom-3 -right-3 h-12 w-12 opacity-25 rotate-12" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M32 6C24 16 18 26 18 36c0 10 6 18 14 18s14-8 14-18C46 26 40 16 32 6Z" fill="white"/>
            <path d="M32 10c-5 8-9 16-9 24 0 8 4 14 9 14s9-6 9-14c0-8-4-16-9-24Z" fill="white" opacity="0.55"/>
          </svg>
        </span>
        <span className="relative z-10">{label}</span>
      </button>
  )
}
