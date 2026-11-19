import { nightlyMeetChecks } from '@/lib/meetCheck';

// The nightly check-in from Google Meet (guide 21, section 15), run by Vercel Cron (web/vercel.json, every night).
// Vercel sends "Authorization: Bearer <CRON_SECRET>" when the CRON_SECRET setting exists in the Vercel project, so
// nobody else can start it. Checks every finished class of the last 7 days that isn't final yet, one at a time.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Not allowed', { status: 401 });
  }
  try {
    const tally = await nightlyMeetChecks(Date.now() + 50_000);
    return Response.json({ ok: true, ...tally });
  } catch (e) {
    console.error('Nightly check-in from Meet:', e);
    return Response.json({ ok: false, problem: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
