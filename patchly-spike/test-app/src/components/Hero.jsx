import { Button } from './Button.jsx'

export function Hero() {
  return (
    <div className="flex flex-col items-center py-20 bg-red-50">
      <h1 className="text-4xl font-bold text-red-600">Hello Patchly</h1>
      <p className="mt-4 text-lg text-gray-600">Select any element and fix it</p>
      <Button label="Get Started" />
    </div>
  )
}
