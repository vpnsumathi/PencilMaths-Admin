'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// Supabase's built-in invite email lands here with the session in the
// address hash (#access_token=…&refresh_token=…), or with #error=… when the
// link was already used or has run out.
export default function AcceptInvite() {
  const router = useRouter();
  const started = useRef(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.hash.slice(1));
    const reason = params.get('error_description') ?? params.get('error');
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    // Keep tokens out of the address bar and browser history.
    window.history.replaceState(null, '', window.location.pathname);

    if (reason) {
      setProblem(reason.replace(/\+/g, ' '));
      return;
    }
    if (!access_token || !refresh_token) {
      setProblem('The link has no sign-in details.');
      return;
    }

    // The default browser client expects ?code= links (PKCE) and rejects the
    // #access_token links invites use, so read the hash ourselves.
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { flowType: 'implicit', detectSessionInUrl: false } },
    );
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (error) {
        console.error('accept invite failed:', error.message);
        setProblem(error.message);
      } else {
        router.replace('/reset-password');
      }
    });
  }, [router]);

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      {problem ? (
        <>
          <h1>This link has expired</h1>
          <p>
            Invite links work once and only for a limited time. Please ask Pencil Maths to send a
            new invite.
          </p>
          <p style={{ color: '#666', fontSize: 14 }}>Reason: {problem}</p>
        </>
      ) : (
        <p>Signing you in…</p>
      )}
    </main>
  );
}
