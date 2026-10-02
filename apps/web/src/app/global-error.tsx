'use client'

/** Last resort when the root layout itself fails: no app styles are available. */
export default function GlobalError({
  reset,
}: {
  readonly error: Error
  readonly reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'grid',
          placeItems: 'center',
          minHeight: '100vh',
          margin: 0,
        }}
      >
        <main style={{ textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 24 }}>CreatorHub could not load</h1>
          <p style={{ color: 'GrayText' }}>Something broke on our side. Try again in a moment.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              padding: '10px 18px',
              borderRadius: 10,
              border: '1px solid ButtonBorder',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
