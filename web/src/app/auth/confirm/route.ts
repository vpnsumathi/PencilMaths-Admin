import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Invite emails land here (see the Invite user email template in Supabase).
// The one-time token_hash is checked, which signs the person in, then they choose a password.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/';

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    // Only pages on this site, so the link can't be used to send people elsewhere.
    if (!error) return NextResponse.redirect(`${origin}${/^\/(?!\/)/.test(next) ? next : '/'}`);
    console.error('confirm failed:', error.message);
  }
  return NextResponse.redirect(`${origin}/login`);
}
