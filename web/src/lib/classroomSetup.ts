import 'server-only';
import {
  activateCourse, classroomProblem, createCourse, deleteInvitation, findTeacherInvitation, getCourse, getInvitation,
  inviteTeacher, isCourseTeacher, studentLink, type Course,
} from '@/lib/google/classroom';
import { meetProblem } from '@/lib/google/meet';
import { ensureMeetRoom } from '@/lib/meetRoom';
import { yearLabel } from '@/lib/options';
import { createAdminClient } from '@/lib/supabase/admin';

// The Create Google Classroom button (guide 21, section 11): the steps, kept in batch_classrooms so a press of
// Finish setup always carries on from the last step that worked.
//
//   1. A row with the class's fixed id (alias) is saved BEFORE Google is asked, so a retry uses the same alias.
//   2. Create the class (or find it, if Google already has that alias). Its id and link are saved straight away.
//   3. Make it active. Google may refuse for a personal Gmail account: then the owner accepts it once in Classroom.
//   4. Once active: students get Join class (batches.class_link = the class's invite link).
//   5. Invite the batch's teacher. Before inviting, the class's teachers and invitations are checked, so a teacher
//      is never invited twice. Their Join class appears once Google says they have joined.
//
// Only staff start this (classroomActions.ts). Google is only ever called from the server; the table is written
// with the server's own key, after the staff check.

export type ClassroomRow = {
  batch_id: string;
  alias: string;
  course_id: string | null;
  course_state: string | null;
  teacher_link: string | null;
  enrollment_code: string | null;
  teacher_id: string | null;
  teacher_email: string | null;
  invitation_id: string | null;
  teacher_status: 'none' | 'invited' | 'joined' | 'gone';
  invited_at: string | null;
  joined_at: string | null;
  last_error: string | null;
  checked_at: string | null;
  created_at: string;
};

export const aliasFor = (batchId: string) => `p:batch_${batchId}`;

// Still waiting for something (to be accepted, or for the teacher)? Then the page asks Google again after a couple
// of minutes; once everything is done, once a day (to notice a new class code, or the class being archived).
export const isPending = (r: ClassroomRow) => !r.course_id || r.course_state !== 'ACTIVE' || r.teacher_status === 'invited';
const stale = (r: ClassroomRow) => {
  const age = r.checked_at ? Date.now() - new Date(r.checked_at).getTime() : Infinity;
  return age > (isPending(r) ? 2 * 60_000 : 24 * 60 * 60_000);
};

type Batch = {
  id: string; code: string; name: string | null; year_group: number; teacher_id: string | null; closed_on: string | null;
  class_link: string | null;
  subjects: { name: string } | null;
  teachers: { id: string; first_name: string; last_name: string; personal_email: string | null; status: string } | null;
};
type Result = { ok: boolean; message: string };

async function loadBatch(batchId: string) {
  const db = createAdminClient();
  const [{ data: batch }, { data: row, error }] = await Promise.all([
    db.from('batches')
      .select('id, code, name, year_group, teacher_id, closed_on, class_link, subjects(name), teachers(id, first_name, last_name, personal_email, status)')
      .eq('id', batchId).maybeSingle(),
    db.from('batch_classrooms').select('*').eq('batch_id', batchId).maybeSingle(),
  ]);
  if (error) throw new Error(`batch_classrooms: ${error.message}`);
  return { db, batch: batch as unknown as Batch | null, row: row as ClassroomRow | null };
}

async function save(db: ReturnType<typeof createAdminClient>, batchId: string, change: Partial<ClassroomRow>) {
  const { data, error } = await db.from('batch_classrooms').update(change).eq('batch_id', batchId).select('*').single();
  if (error) throw new Error(`Saving the Google Classroom setup failed: ${error.message}`);
  return data as ClassroomRow;
}

// What is kept of Google's answer. Only a Google Classroom address and a plain class code are kept (the database
// checks the same), so nothing else can ever end up behind Join class.
const courseFields = (c: Course): Partial<ClassroomRow> => ({
  course_id: c.id,
  course_state: c.courseState ?? null,
  teacher_link: c.alternateLink && /^https:\/\/classroom\.google\.com\/\S*$/.test(c.alternateLink) && c.alternateLink.length <= 500 ? c.alternateLink : null,
  enrollment_code: c.enrollmentCode && /^[A-Za-z0-9]{4,20}$/.test(c.enrollmentCode) ? c.enrollmentCode : null,
});

// Students' Join class: the invite link while the class is active, otherwise nothing. (A closed batch's link is
// already hidden from students by the database, and comes back by itself if the batch is reopened.)
async function syncStudentLink(db: ReturnType<typeof createAdminClient>, batch: Batch, row: ClassroomRow) {
  const link = row.course_state === 'ACTIVE' && row.teacher_link ? studentLink(row.teacher_link, row.enrollment_code) : null;
  if (link === batch.class_link) return;
  const { error } = await db.from('batches').update({ class_link: link }).eq('id', batch.id);
  if (error) throw new Error(`Saving the students' class link failed: ${error.message}`);
  batch.class_link = link;
}

// Where the batch's teacher is with this class: joined, invited (with the invitation), or neither.
async function teacherState(row: ClassroomRow, email: string) {
  if (await isCourseTeacher(row.course_id!, email)) return { status: 'joined' as const, invitation: null };
  const invitation = (row.invitation_id && (await getInvitation(row.invitation_id))) || (await findTeacherInvitation(row.course_id!, email));
  return invitation ? { status: 'invited' as const, invitation } : { status: 'none' as const, invitation: null };
}

// Steps 5: the teacher. Returns a sentence for the message, and the row as saved.
async function teacherStep(db: ReturnType<typeof createAdminClient>, batch: Batch, row: ClassroomRow, resend: boolean) {
  const t = batch.teachers && batch.teachers.status !== 'left' ? batch.teachers : null;
  if (!t) return { row, note: 'The batch has no teacher yet, so no teacher was invited.' };
  const name = `${t.first_name} ${t.last_name}`;
  const email = t.personal_email?.trim().toLowerCase() ?? '';
  if (!email) return { row, note: `Add ${name}'s Google account email on their teacher page, then press Finish setup to invite them.` };

  // The batch's teacher (or their email) changed since the last invite: start again for the new one. A waiting
  // invitation to the old teacher is taken back; someone who already joined stays until removed in Classroom.
  if (row.teacher_id !== t.id || (row.teacher_email ?? '').toLowerCase() !== email) {
    if (row.invitation_id && row.teacher_status === 'invited') await deleteInvitation(row.invitation_id);
    row = await save(db, batch.id, {
      teacher_id: t.id, teacher_email: email, invitation_id: null, teacher_status: 'none', invited_at: null, joined_at: null,
    });
  }

  const now = await teacherState(row, email);
  if (now.status === 'joined') {
    row = await save(db, batch.id, { teacher_status: 'joined', invitation_id: null, joined_at: row.joined_at ?? new Date().toISOString() });
    return { row, note: `${name} has joined the class.` };
  }
  if (now.status === 'invited') {
    row = await save(db, batch.id, { teacher_status: 'invited', invitation_id: now.invitation.id, invited_at: row.invited_at ?? new Date().toISOString() });
    return { row, note: `${name} has been invited (${email}) and gets Join class here once they accept Google's email.` };
  }
  // No invitation and not a teacher. If they had been invited before, they declined it or were removed:
  // only invite again when someone presses Resend invite.
  if ((row.teacher_status === 'invited' || row.teacher_status === 'joined' || row.teacher_status === 'gone') && !resend) {
    row = await save(db, batch.id, { teacher_status: 'gone', invitation_id: null });
    return { row, note: `${name}'s invitation is no longer there (declined, or removed from the class). Press Resend invite to send a new one.` };
  }
  const invitation = await inviteTeacher(row.course_id!, email);
  row = await save(db, batch.id, invitation
    ? { teacher_status: 'invited', invitation_id: invitation.id, invited_at: new Date().toISOString(), joined_at: null }
    : { teacher_status: 'joined', invitation_id: null, joined_at: new Date().toISOString() });
  return { row, note: invitation ? `${name} has been invited (${email}). Google has emailed them.` : `${name} has joined the class.` };
}

// Create, or carry on setting up, a batch's Google Classroom class. Safe to run any number of times.
export async function runClassroomSetup(batchId: string, staffId: string, opts: { resend?: boolean } = {}): Promise<Result> {
  const loaded = await loadBatch(batchId);
  const { db, batch } = loaded;
  let { row } = loaded;
  if (!batch) return { ok: false, message: 'Batch not found.' };
  if (!row) {
    if (batch.closed_on) return { ok: false, message: 'This batch is closed, so no class was created.' };
    if (batch.class_link) return { ok: false, message: 'This batch already has a class link. Remove it first to create a new class.' };
    // Step 1: the fixed id, saved before Google is asked. A second press at the same moment finds this row.
    const { error } = await db.from('batch_classrooms').upsert(
      { batch_id: batch.id, alias: aliasFor(batch.id), created_by: staffId }, { onConflict: 'batch_id', ignoreDuplicates: true });
    if (error) return { ok: false, message: `Could not start: ${error.message}` };
    row = (await loadBatch(batchId)).row!;
  }

  try {
    // Step 2: create the class, or read it again to see whether it has been accepted since.
    const course = row.course_id
      ? await getCourse(row.course_id)
      : await createCourse({
          alias: row.alias,
          name: `${batch.code}${batch.name ? ` · ${batch.name}` : ''}`,
          section: `${batch.subjects?.name ?? ''} · ${yearLabel(batch.year_group)}`.replace(/^ · /, ''),
        });
    row = await save(db, batch.id, courseFields(course));

    // Step 3: make it active if Google lets the app.
    if (row.course_state === 'PROVISIONED') {
      const active = await activateCourse(row.course_id!);
      if (active) row = await save(db, batch.id, courseFields(active));
    }
    // Step 4: students' link.
    await syncStudentLink(db, batch, row);

    if (row.course_state !== 'ACTIVE') {
      row = await save(db, batch.id, { last_error: null, checked_at: new Date().toISOString() });
      return {
        ok: true,
        message: row.course_state === 'PROVISIONED'
          ? 'The class is made in Google Classroom. Google needs it accepted once: open Google Classroom with the Pencil Maths Google account, press Accept on the class, then press Check now here.'
          : `The class is ${row.course_state?.toLowerCase() ?? 'not active'} in Google Classroom, so students don't see Join class.`,
      };
    }

    // Step 5: the teacher.
    const teacher = await teacherStep(db, batch, row, Boolean(opts.resend));
    await save(db, batch.id, { last_error: null, checked_at: new Date().toISOString() });
    // Step 6: the batch's Meet room (guide 21, section 12). Not needed for the class itself, so a problem here
    // only adds a note; the Meet room box on the batch page can make it later.
    const meet = await ensureMeetRoom(batch.id, staffId).then(() => '', (e) => {
      console.error('Meet room:', e);
      return ` The Meet room wasn't made (${/batch_meet_rooms/.test(String(e)) ? 'run 20261114000001_meet_rooms.sql first' : meetProblem(e)}); use Create Meet room below.`;
    });
    return { ok: true, message: `Google Classroom class ready: students now see Join class. ${teacher.note}${meet}` };
  } catch (e) {
    console.error('Google Classroom setup:', e);
    const message = classroomProblem(e);
    try { await save(db, batch.id, { last_error: message.slice(0, 500), checked_at: new Date().toISOString() }); } catch { /* shown anyway */ }
    return { ok: false, message: `${message} Press Finish setup to try again from where it stopped.` };
  }
}

// When the batch page opens: if something is still waiting (or it's a day since the last look), ask Google for the
// class and the teacher, and save what changed. Only reads from Google: inviting and activating are left to the
// buttons. Never throws: if Google can't be reached, the page shows what was saved before.
export async function refreshClassroom(row: ClassroomRow): Promise<ClassroomRow> {
  if (!row.course_id || !stale(row)) return row;
  try {
    const loaded = await loadBatch(row.batch_id);
    const { db, batch } = loaded;
    let fresh = loaded.row;
    if (!batch || !fresh?.course_id) return fresh ?? row;
    fresh = await save(db, batch.id, courseFields(await getCourse(fresh.course_id)));
    await syncStudentLink(db, batch, fresh);
    if (fresh.course_state === 'ACTIVE' && fresh.teacher_email && fresh.teacher_status === 'invited') {
      const now = await teacherState(fresh, fresh.teacher_email);
      if (now.status === 'joined') fresh = await save(db, batch.id, { teacher_status: 'joined', invitation_id: null, joined_at: new Date().toISOString() });
      else if (now.status === 'none') fresh = await save(db, batch.id, { teacher_status: 'gone', invitation_id: null });
    }
    return await save(db, batch.id, { checked_at: new Date().toISOString() });
  } catch (e) {
    console.error('Google Classroom check:', e);
    try {
      const db = createAdminClient();
      await db.from('batch_classrooms').update({ checked_at: new Date().toISOString() }).eq('batch_id', row.batch_id);
    } catch { /* nothing more to do */ }
    return row;
  }
}

// "Disconnect": the batch forgets the class (and students lose Join class). The class itself stays in Google
// Classroom; pressing Create again finds the same class by its alias.
export async function disconnectClassroom(batchId: string): Promise<Result> {
  const db = createAdminClient();
  const { error } = await db.from('batch_classrooms').delete().eq('batch_id', batchId);
  if (error) return { ok: false, message: `Could not disconnect: ${error.message}` };
  const { error: linkError } = await db.from('batches').update({ class_link: null }).eq('id', batchId);
  if (linkError) return { ok: false, message: `Disconnected, but the students' link could not be removed: ${linkError.message}` };
  return { ok: true, message: 'Disconnected. The class is still in Google Classroom: archive it there if it is no longer needed. Create finds the same class again.' };
}
