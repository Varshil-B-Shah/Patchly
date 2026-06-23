export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 48, maxWidth: 560 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Patchly</h1>
      <p style={{ color: '#555', marginTop: 8 }}>
        Review comments backend. The dashboard UI lands in a later step.
      </p>
      <p style={{ marginTop: 16 }}>
        <a href="/api/auth/signin" style={{ color: '#6366f1' }}>
          Sign in with GitHub →
        </a>
      </p>
    </main>
  )
}
