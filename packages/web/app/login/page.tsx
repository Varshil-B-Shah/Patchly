import { signIn } from '@/lib/auth'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-10 rounded-2xl shadow-md text-center space-y-6 w-80">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patchly</h1>
          <p className="text-sm text-gray-500 mt-1">Review comments for your preview apps</p>
        </div>
        <form action={async () => {
          'use server'
          await signIn('github', { redirectTo: '/dashboard' })
        }}>
          <button
            type="submit"
            className="w-full bg-gray-900 text-white py-2.5 px-4 rounded-lg hover:bg-gray-700 transition font-medium text-sm"
          >
            Sign in with GitHub
          </button>
        </form>
      </div>
    </div>
  )
}
