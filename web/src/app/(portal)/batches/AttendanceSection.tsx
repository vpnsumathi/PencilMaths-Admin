import Link from 'next/link';
import { Section } from '@/components/Section';
import ui from '@/components/ui.module.css';
import { ATTENDANCE_LABEL, markLabel, shiftTime, type ClassWindow } from '@/lib/classLink';
import { formatClock, formatDate, formatDay, formatTime } from '@/lib/format';
import { todayInUk } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import styles from './attendance.module.css';
import { saveRegister } from './classActions';
import { RegisterButton } from './RegisterButton';

// What batch_register() returns (supabase/migrations/20261111000001_class_link_attendance.sql).
type Entry = {
  id: string; first_name: string; last_name: string;
  status: 'present' | 'late' | 'absent' | null;
  source: 'auto' | 'link' | 'staff' | null;
  joined_at: string | null; marked_by: string | null; in_batch: boolean;
  // Every saved change for that class, oldest first (attendance_changes).
  history?: { at: string; from: string | null; from_source: string | null; to: string; reason: string | null; by: string | null }[];
};
type Register = {
  class_date: string; session_id: string | null; start_time: string | null; class_day: boolean;
  students: Entry[];
  recent: { class_date: string; present: number; late: number; absent: number }[];
  window: ClassWindow;
};

// How an entry got its status, in words, for the middle column.
function how(s: Entry) {
  const joined = s.joined_at ? `checked in on the portal at ${formatClock(s.joined_at)}` : '';
  const gone = s.in_batch ? '' : ' · no longer in this batch';
  if (!s.status) return `Not marked yet${gone}`;
  if (s.source === 'auto') return `Has not checked in${gone}`;
  if (s.source === 'link') return `${markLabel(s.status, s.source)} on the portal at ${formatClock(s.joined_at)} · not confirmed${gone}`;
  return `Set by ${s.marked_by ?? 'staff'}${joined ? ` · ${joined}` : ''}${gone}`;
}

// The attendance register of one class day: who checked in on the portal, and Present / Late / Absent for staff or
// the batch's teacher to set or correct. Their entry is final: a later press on Join class never changes it.
// Students who haven't checked in have nothing ticked, so saving one change during class leaves them open to check
// in later. "Save and mark the rest absent" confirms them as absent in the same save.
export async function AttendanceSection({ batchId, classDate }: { batchId: string; classDate?: string }) {
  const today = todayInUk();
  // Only a real date that isn't in the future; anything else shows today.
  const date = classDate && /^\d{4}-\d{2}-\d{2}$/.test(classDate) && classDate <= today ? classDate : today;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('batch_register', { p_batch: batchId, p_date: date });
  const register = data as Register | null;
  // For the section header: the latest class with a register.
  const last = register?.recent[0];
  const summary = !register ? 'Not available yet'
    : last ? `Last class ${formatDate(last.class_date)}: ${last.present + last.late} of ${last.present + last.late + last.absent} attended`
    : 'No registers yet';

  return (
    // Open by itself when a class date was chosen (and after saving that day's register).
    <Section id="attendance" title="Attendance" summary={summary} forceOpen={Boolean(classDate)}>
      {error || !register ? (
        <p className={ui.empty}>
          {error?.code === 'PGRST202'
            ? 'The database is not ready for this yet: run 20261111000001_class_link_attendance.sql in Supabase first.'
            : 'The register could not be loaded.'}
        </p>
      ) : (
        <>
          <form method="get" action={`/batches/${batchId}`} className={styles.dateRow}>
            <label className={ui.label} htmlFor="class_date">Class date</label>
            <input id="class_date" name="class_date" type="date" required max={today} defaultValue={date} className={ui.input} />
            <button className={ui.button}>Show</button>
            {date !== today && <Link href={`/batches/${batchId}#attendance`} className={ui.link}>Today</Link>}
            <Link href={`/attendance?batch=${batchId}`} className={ui.link} style={{ marginLeft: 'auto' }}>Attendance List for this batch →</Link>
          </form>

          {register.recent.length > 0 && (
            <ul className={styles.recent} aria-label="Earlier classes">
              {register.recent.map((r) => (
                <li key={r.class_date}>
                  <Link href={`/batches/${batchId}?class_date=${r.class_date}#attendance`} aria-current={r.class_date === date ? 'true' : undefined}
                    title={`${r.present} present, ${r.late} late, ${r.absent} absent`}>
                    {formatDate(r.class_date)} · {r.present + r.late}/{r.present + r.late + r.absent}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <p className={ui.hint} style={{ margin: '0 0 8px' }}>
            <strong>{formatDate(date)}{date === today ? ' (today)' : ''}</strong>
            {register.start_time
              ? <> · class time {formatTime(register.start_time)}. A student who presses Join class between{' '}
                  {shiftTime(register.start_time, -register.window.before_minutes)} and{' '}
                  {shiftTime(register.start_time, register.window.after_minutes)} is marked Present, or Late after{' '}
                  {shiftTime(register.start_time, register.window.late_minutes)}.</>
              : <> · no class is planned on this day. You can still take a register by hand.</>}
            {!register.session_id && register.class_day && <> No register yet for this day.</>}
          </p>

          {register.students.length === 0 ? (
            <p className={ui.empty}>No students in this batch.</p>
          ) : (
            <form action={saveRegister}>
              <input type="hidden" name="batch_id" value={batchId} />
              <input type="hidden" name="class_date" value={date} />
              <ul className={styles.register}>
                {register.students.map((s) => (
                  <li key={s.id}>
                    <input type="hidden" name="student" value={s.id} />
                    <strong>{s.first_name} {s.last_name}</strong>
                    <span className={styles.how}>{how(s)}</span>
                    <div className={styles.markCell}>
                    <fieldset className={styles.choices}>
                      <legend className={ui.srOnly}>Attendance for {s.first_name} {s.last_name}</legend>
                      {(['present', 'late', 'absent'] as const).map((value) => (
                        <label key={value} className={`${styles.choice} ${styles[value]}`}>
                          <input type="radio" name={`status_${s.id}`} value={value} defaultChecked={s.source !== 'auto' && s.status === value} />
                          {ATTENDANCE_LABEL[value]}
                        </label>
                      ))}
                    </fieldset>
                    {/* Needed to change a mark that was already saved, or a check-in. */}
                    {s.status && s.source !== 'auto' && (
                      <input name={`reason_${s.id}`} maxLength={300} className={`${ui.input} ${styles.reason}`}
                        placeholder="Reason, if you change this mark" aria-label={`Reason for changing ${s.first_name}'s mark`} />
                    )}
                    </div>
                    {(s.history ?? []).length > 0 && (
                      <details className={styles.history}>
                        <summary>Changes ({s.history!.length})</summary>
                        <ul>
                          {s.history!.map((h, i) => (
                            <li key={i}>
                              {formatDay(h.at)} {formatClock(h.at)} · {h.by ?? 'Staff'}:{' '}
                              {h.from ? `${markLabel(h.from, h.from_source)} → ` : ''}{ATTENDANCE_LABEL[h.to] ?? h.to}
                              {h.reason ? ` · "${h.reason}"` : ''}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
              <div className={ui.formActions}>
                <RegisterButton />
                <RegisterButton restAbsent />
                <span className={ui.muted} style={{ fontSize: 13 }}>
                  Only ticked students are saved, and saving confirms them: a later check-in doesn&apos;t change it.
                  Students left unticked can still check in. Changing a saved mark or a check-in needs a reason.
                </span>
              </div>
            </form>
          )}
        </>
      )}
    </Section>
  );
}
