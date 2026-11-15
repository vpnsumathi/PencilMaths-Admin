'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff, requireStaffOrTeacher } from '@/lib/auth';
import { NOT_READY } from '@/lib/extraClasses';
import { ensureExtraMeetRoom, recreateExtraMeetRoom } from '@/lib/extraMeet';
import { redirectWith, text } from '@/lib/form';
import { meetProblem } from '@/lib/google/meet';
import { todayInUk, UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// Extra classes (guide 24): book, change, cancel and restore (staff), take the register (staff or the class's
// teacher), and the class's Meet room. Every rule is checked again by the database functions these call.

type DbError = { code?: string; message: string } | null;
// A database problem in words: P0001 is a message the database raised on purpose.
function problem(error: DbError, fallback: string) {
  if (!error) return fallback;
  console.error('Extra classes:', error.message);
  if (error.code === 'PGRST202' || error.code === '42883') return NOT_READY;
  return error.code === 'P0001' ? error.message : fallback;
}

const refresh = (id?: string) => {
  revalidatePath('/extra-classes');
  if (id) revalidatePath(`/extra-classes/${id}`);
  revalidatePath('/students', 'layout');
  revalidatePath('/class-schedule');
  revalidatePath('/');
};

// ---------- The booking form ----------
export type CheckInput = {
  id?: string | null; teacher_id: string; class_date: string; start_time: string; length_minutes: number; students: string[];
};
export type CheckResult = { errors: string[]; warnings: string[]; problem?: string };

// The clash check the form runs as staff type (the database runs it again on save).
export async function checkExtraClass(input: CheckInput): Promise<CheckResult> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('extra_class_check', { p: input });
  if (error) return { errors: [], warnings: [], problem: problem(error, 'The clash check could not run. It runs again when you save.') };
  return data as CheckResult;
}

export type Absence = { session_id: string; class_date: string; batch_code: string; source: string | null };

// Each student's missed classes in a subject over the last 8 weeks, for "Catch-up for".
export async function studentAbsences(studentIds: string[], subjectId: string): Promise<Record<string, Absence[]>> {
  await requireStaff();
  const ids = studentIds.filter((s) => UUID.test(s)).slice(0, 100);
  if (ids.length === 0 || !/^[A-Za-z0-9_-]{1,40}$/.test(subjectId)) return {};
  const since = new Date(`${todayInUk()}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 56);
  const supabase = await createClient();
  const { data, error } = await supabase.from('attendance')
    .select('session_id, student_id, source, class_sessions!inner(class_date, batches!inner(code, subject_id))')
    .in('student_id', ids).eq('status', 'absent')
    .gte('class_sessions.class_date', since.toISOString().slice(0, 10))
    .eq('class_sessions.batches.subject_id', subjectId);
  if (error) {
    console.error('studentAbsences:', error.message);
    return {};
  }
  type Row = { session_id: string; student_id: string; source: string | null; class_sessions: { class_date: string; batches: { code: string } } };
  const out: Record<string, Absence[]> = {};
  for (const r of (data ?? []) as unknown as Row[]) {
    (out[r.student_id] ??= []).push({ session_id: r.session_id, class_date: r.class_sessions.class_date, batch_code: r.class_sessions.batches.code, source: r.source });
  }
  for (const list of Object.values(out)) list.sort((a, b) => b.class_date.localeCompare(a.class_date));
  return out;
}

export type SaveState = { error: string; at: number } | null;

// Book a class, record a past one, or save changes to one. The form sends everything as one JSON field.
export async function saveExtraClass(_prev: SaveState, form: FormData): Promise<SaveState> {
  await requireStaff();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text(form, 'payload'));
  } catch {
    return { error: 'The form could not be read. Please reload the page and try again.', at: Date.now() };
  }
  const editing = typeof payload.id === 'string' && UUID.test(payload.id);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_extra_class', { p: payload });
  if (error) return { error: problem(error, 'Could not save the extra class. Please try again.'), at: Date.now() };

  const saved = data as { id: string; code: string; version: number };
  let message = editing ? `${saved.code} saved.` : payload.recorded ? `${saved.code} recorded. Take attendance below.` : `${saved.code} created.`;
  // A class still to come gets its Meet room straight away. If Google can't be reached it is made later
  // (Make Meet room on the class page, or by itself when someone first joins).
  if (!payload.recorded) {
    try {
      await ensureExtraMeetRoom(saved.id);
    } catch (e) {
      console.error('Extra class Meet room:', e);
      message += ` The Meet room couldn't be made yet (${meetProblem(e)}). Press Make Meet room below, or it is made when someone first joins.`;
    }
  }
  refresh(saved.id);
  redirect(`/extra-classes/${saved.id}?ok=${encodeURIComponent(message)}`);
}

// ---------- On the class page ----------
const classId = (form: FormData) => {
  const id = text(form, 'id');
  if (!UUID.test(id)) redirectWith('/extra-classes', 'error', 'Extra class not found.');
  return id;
};

export async function cancelExtraClass(form: FormData) {
  await requireStaff();
  const id = classId(form);
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_extra_class', {
    p_id: id, p_version: Number(text(form, 'version')), p_asked_by: text(form, 'asked_by'), p_reason: text(form, 'reason'),
  });
  refresh(id);
  if (error) redirectWith(`/extra-classes/${id}`, 'error', problem(error, 'Could not cancel the class. Please try again.'));
  redirectWith(`/extra-classes/${id}`, 'ok', 'Class cancelled. Let the family know (WhatsApp parent below) and the teacher.');
}

export async function restoreExtraClass(form: FormData) {
  await requireStaff();
  const id = classId(form);
  const supabase = await createClient();
  const { error } = await supabase.rpc('restore_extra_class', { p_id: id, p_version: Number(text(form, 'version')) });
  refresh(id);
  if (error) redirectWith(`/extra-classes/${id}`, 'error', problem(error, 'Could not restore the class. Please try again.'));
  redirectWith(`/extra-classes/${id}`, 'ok', 'Class restored. Let the family and the teacher know it is on again.');
}

// The register: one Present / Late / Absent choice per student, and a reason where a saved mark is changed.
export async function saveExtraRegister(form: FormData) {
  await requireStaffOrTeacher();
  const id = classId(form);
  const marks = form.getAll('student').map(String).filter((s) => UUID.test(s))
    .map((s) => ({ student_id: s, status: text(form, `mark_${s}`), reason: text(form, `reason_${s}`) || null }))
    .filter((m) => m.status);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_extra_register', { p_id: id, p_marks: marks });
  refresh(id);
  if (error) redirectWith(`/extra-classes/${id}`, 'error', problem(error, 'Could not save the attendance. Please try again.'));
  const changed = Number(data ?? 0);
  redirectWith(`/extra-classes/${id}`, 'ok', changed === 0 ? 'Attendance saved (nothing changed).' : `Attendance saved: ${changed} ${changed === 1 ? 'mark' : 'marks'} set.`);
}

// Make Meet room / Recreate room (staff).
export async function extraMeetRoomAction(form: FormData) {
  await requireStaff();
  const id = classId(form);
  const replace = text(form, 'replace') === 'yes';
  let message: string;
  let ok = true;
  try {
    if (replace) {
      message = (await recreateExtraMeetRoom(id))
        ? 'New Meet room made: Join class uses its new link from now on. The old room is closed, so the old link no longer lets anyone in.'
        : 'New Meet room made: Join class uses its new link from now on. Google wouldn\'t close the old room, so anyone who kept the old link may still get in.';
    } else {
      await ensureExtraMeetRoom(id);
      message = 'Meet room made.';
    }
  } catch (e) {
    console.error('Extra class Meet room:', e);
    ok = false;
    message = /extra_classes/.test(String(e)) ? NOT_READY : meetProblem(e);
  }
  refresh(id);
  redirectWith(`/extra-classes/${id}`, ok ? 'ok' : 'error', message);
}
