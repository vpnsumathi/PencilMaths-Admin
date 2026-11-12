import 'server-only';
import { headers } from 'next/headers';

// The address of the site handling this request, e.g. "https://staging-pencilmaths.vercel.app",
// so links in emails (invites, password resets) always open the site they were sent from:
// staging sends staging links, production sends production links, your computer sends localhost.
// Supabase only accepts addresses listed in its Redirect URLs, so a faked address is refused there.
// Falls back to NEXT_PUBLIC_SITE_URL when there is no request (should not happen in an action).
export async function siteUrl() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const proto = h.get('x-forwarded-proto') ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}
