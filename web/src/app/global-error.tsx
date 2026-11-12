'use client';

import { useEffect } from 'react';
import './globals.css';

// The last safety net: shown only if the whole site fails to start (the main layout itself broke), so it
// can't rely on anything else. It has its own <html> and <body>, and plain styles.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en-GB">
      <body>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '32px 16px' }}>
          <section role="alert" style={{
            maxWidth: 420, width: '100%', padding: 32, borderRadius: 16, background: '#fff',
            border: '1px solid #e2e8f0', textAlign: 'center', fontFamily: 'system-ui, sans-serif',
          }}>
            <p style={{ margin: '0 0 16px', fontWeight: 700, color: '#4f46e5' }}>Pencil Maths</p>
            <h1 style={{ margin: 0, fontSize: 22 }}>Sorry, something went wrong</h1>
            <p style={{ margin: '8px 0 24px', color: '#64748b', lineHeight: 1.5 }}>
              The site could not be loaded. Please try again in a moment. If it keeps happening, please tell Pencil Maths.
            </p>
            <button type="button" onClick={() => reset()} style={{
              height: 48, width: '100%', border: 0, borderRadius: 10, background: '#4f46e5', color: '#fff',
              font: 'inherit', fontWeight: 700, cursor: 'pointer',
            }}>
              Try again
            </button>
            {error.digest && <p style={{ margin: '16px 0 0', color: '#64748b', fontSize: 13 }}>Reference: {error.digest}</p>}
          </section>
        </main>
      </body>
    </html>
  );
}
