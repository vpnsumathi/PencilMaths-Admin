import { NextResponse, type NextRequest } from 'next/server';
import { getViewer } from '@/lib/auth';
import { ukClock } from '@/lib/extraClasses';
import { extraMeetLink } from '@/lib/extraMeet';
import { meetProblem } from '@/lib/google/meet';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// Join class for staff and the class's teacher: opens the extra class's Google Meet room (made now if it has
// none yet: the one change this GET can make, and only to the class's own room). The database decides who may see
// the class (a teacher only their own). A teacher gets in only at class time, as on the page; staff any time
// (Open the Meet room). Guide 24.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const back = (message: string) =>
    NextResponse.redirect(new URL(`/extra-classes/${UUID.test(id) ? id : ''}?error=${encodeURIComponent(message)}`, request.url));
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL('/login', request.url));
  if (!UUID.test(id)) return back('Extra class not found.');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('extra_class_detail', { p_id: id });
  if (error || !data) return back('Extra class not found.');
  const c = data as { status: string; opens_at: string };
  if (c.status === 'cancelled') return back('This class was cancelled.');
  if (viewer.kind === 'teacher' && c.status !== 'live') {
    return back(c.status === 'upcoming' ? `Join class opens at ${ukClock(c.opens_at)}, 15 minutes before the start.` : 'This class has finished.');
  }
  try {
    const link = await extraMeetLink(id);
    if (link) return NextResponse.redirect(link);
    return back('This class has no Meet room yet.');
  } catch (e) {
    console.error('Open extra class Meet room:', e);
    return back(`Could not open the Meet room: ${meetProblem(e)}`);
  }
}
