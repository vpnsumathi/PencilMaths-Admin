import { NextResponse, type NextRequest } from 'next/server';
import { getViewer } from '@/lib/auth';
import { CLASS_WINDOW, currentClass } from '@/lib/classLink';
import { meetLink } from '@/lib/meetRoom';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// Join class for staff and the batch's teacher at class time: opens the batch's Google Meet room with its
// current link (guide 21, section 12). The database decides who may see the batch (a teacher only their own).
// A teacher gets in only at class time (from 15 minutes before a class time), as on the page; staff any time.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const back = (message: string) =>
    NextResponse.redirect(new URL(`/batches/${UUID.test(id) ? id : ''}?error=${encodeURIComponent(message)}`, request.url));
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL('/login', request.url));
  if (!UUID.test(id)) return back('Batch not found.');

  const supabase = await createClient();
  const { data: batch } = await supabase.from('batches').select('id, batch_slots(weekday, start_time)').eq('id', id).maybeSingle();
  if (!batch) return back('Batch not found.');
  const slots = (batch.batch_slots ?? []) as { weekday: number; start_time: string }[];
  if (viewer.kind === 'teacher' && !currentClass(slots, CLASS_WINDOW)) {
    return back('The Meet room opens at class time, from 15 minutes before the start.');
  }
  try {
    const link = await meetLink(id);
    if (link) return NextResponse.redirect(link);
    return back('This batch has no Meet room yet.');
  } catch (e) {
    console.error('Open Meet room:', e);
    return back('Could not open the Meet room. Please try again.');
  }
}
