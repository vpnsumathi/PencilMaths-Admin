'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cleanClassLink } from '@/lib/classLink';
import { redirectWith, text } from '@/lib/form';
import { meetLink } from '@/lib/meetRoom';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// A student presses Join class. The database (join_class) checks the class is theirs, marks them present or
// late if it is class time, and only then gives back the class link, which is where the student is sent.
// The link is never part of the page itself, so it can't be copied from the page or pressed without being counted.
// See Help/21-class-link-attendance.md.
export async function joinClass(form: FormData) {
  const batchId = text(form, 'batch_id');
  if (!UUID.test(batchId)) redirectWith('/me/classes', 'error', 'Class not found.');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('join_class', { p_batch: batchId });
  if (error) {
    console.error('joinClass failed:', error.message);
    // P0001 = a message the database raised on purpose (for example "This is not one of your classes.").
    redirectWith('/me/classes', 'error', error.code === 'P0001' ? error.message : 'Could not open your class. Please try again.');
  }

  const result = data as { link: string | null; attendance: string; problem?: string | null } | null;
  // Checked again here, so a student is only ever sent to Google Classroom or Google Meet.
  const link = cleanClassLink(result?.link);
  if (!link) redirectWith('/me/classes', 'error', 'This class has no link yet. Please ask Pencil Maths for it.');
  // The student still gets into the class if marking the attendance failed; staff can set it on the register.
  if (result?.attendance === 'error') console.error('joinClass: attendance was not recorded:', result.problem);

  // At class time (the press counted), a class with a Meet room opens the room itself, so the student lands in the
  // call and the Class Schedule page can see them (guide 21, section 12). Otherwise, or if that fails, Classroom.
  let meet: string | null = null;
  if (['present', 'late', 'already'].includes(result?.attendance ?? '')) {
    try { meet = await meetLink(batchId); } catch (e) { console.error('joinClass: Meet room:', e); }
  }

  revalidatePath('/me', 'layout');
  redirect(meet ?? link!);
}
