import { signIn } from '@/lib/auth'
import { Logo } from '../_marketing/Logo'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl } = await searchParams
  const redirectTo = callbackUrl?.startsWith('/') ? callbackUrl : '/dashboard'

  return (
    <div className="wood-floor min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm relative">
        {/* Tape pins at top corners */}
        <div className="tape absolute -top-2 left-8 w-16 h-3.5 rotate-[-5deg] z-10" />
        <div className="tape-cool tape absolute -top-2 right-8 w-14 h-3.5 rotate-[4deg] z-10" />

        <div className="paper rounded-sm shadow-2xl px-10 py-10 text-center space-y-6">
          <div className="flex justify-center">
            <Logo size="sm" showWordmark={false} />
          </div>

          <div>
            <h1
              className="text-2xl mb-1"
              style={{ fontFamily: 'var(--font-display)', color: '#2a1c0e' }}
            >
              Patchly
            </h1>
            <p className="text-sm" style={{ color: '#8a6a44', opacity: 0.75 }}>
              Sign in to access your dashboard and review links
            </p>
          </div>

          <form action={async () => {
            'use server'
            await signIn('github', { redirectTo })
          }}>
            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-sm text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
              style={{
                background: 'rgba(200,168,100,0.22)',
                border: '1px solid rgba(160,128,70,0.45)',
                color: '#2a1c0e',
                boxShadow: '0 2px 8px rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.3)',
                fontFamily: 'var(--font-body)',
              }}
            >
              Sign in with GitHub
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
