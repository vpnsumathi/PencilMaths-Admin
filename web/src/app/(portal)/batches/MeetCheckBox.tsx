import ui from '@/components/ui.module.css';
import { formatClock } from '@/lib/format';
import styles from './attendance.module.css';

// The check-in from Google Meet for one class (guide 21, section 15), above the class's attendance on the batch page
// and on the extra class page: what Meet said (meet_checks), the teacher's join (teacher_class_attendance), Refresh
// from Meet (staff and the class's teacher), and the teacher's correction (staff only). The teacher's line is kept
// for record keeping (a log of the class), not to assess teachers.

export type MeetCheck = {
  state: 'seen' | 'no_call' | 'no_room' | 'error'; problem: string | null; unknown_guests: number; final: boolean; checked_at: string;
} | null;
export type TeacherRecord = {
  id: number; starts_at: string; first_join: string | null; last_leave: string | null; minutes: number | null; drops: number | null;
  meet_status: 'on_time' | 'late' | 'not_seen'; status: 'on_time' | 'late' | 'not_seen' | 'absent'; source: 'meet' | 'staff';
  reason: string | null;
} | null;

export const TEACHER_STATUS: Record<string, string> = { on_time: 'On time', late: 'Late', not_seen: 'Not seen in Meet', absent: 'Absent' };
// Badge colours (see StatusBadge) for the Teachers tab.
export const TEACHER_TONE: Record<string, string> = { on_time: 'on_time', late: 'late', not_seen: 'closed', absent: 'left' };

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

// What Meet said about the class, in one sentence.
export function meetLine(check: MeetCheck, hasRoom: boolean, opened: boolean) {
  if (!hasRoom) return 'This class has no Google Meet room made by the app, so check-ins come from the Join class button.';
  if (!check) return opened ? 'Not checked with Google Meet yet. Check-ins come from the Join class button until it is.' : null;
  const when = `${formatClock(check.checked_at)}`;
  if (check.state === 'error') {
    return `Google Meet couldn't be asked at ${when}: ${check.problem ?? 'no answer'}. Join class presses count until it can be.`;
  }
  if (check.state === 'no_call') {
    return `Checked with Google Meet at ${when}: nobody started this class's Meet room, so Join class presses count.`;
  }
  if (check.state === 'no_room') return 'No Google Meet room, so check-ins come from the Join class button.';
  const unknown = check.unknown_guests > 0
    ? ` ${check.unknown_guests} ${check.unknown_guests === 1 ? 'person' : 'people'} in the call couldn't be identified, so Join class presses still count.`
    : '';
  return `Checked with Google Meet at ${when}${check.final ? ', after the class' : ' (checked again until the class is over)'}: students are checked in from the call.${unknown}`;
}

// The teacher's join in words: "Joined at 4:03 PM · On time · 55 min in the call · dropped out once".
export function teacherLine(r: NonNullable<TeacherRecord>) {
  const bits: string[] = [];
  if (r.first_join) {
    const late = Math.round((Date.parse(r.first_join) - Date.parse(r.starts_at)) / 60_000);
    bits.push(`Joined at ${formatClock(r.first_join)}${late > 0 ? ` (${late} min after the start)` : ''}`);
  } else {
    bits.push('Meet didn\'t see them in the call');
  }
  bits.push(TEACHER_STATUS[r.status] ?? r.status);
  if (r.minutes !== null) bits.push(`${r.minutes} min in the call`);
  if (r.drops) bits.push(`dropped out ${times(r.drops)}`);
  if (r.source === 'staff') bits.push(`corrected by staff (Meet said ${TEACHER_STATUS[r.meet_status]})${r.reason ? `: “${r.reason}”` : ''}`);
  return bits.join(' · ');
}

type Props = {
  check: MeetCheck; hasRoom: boolean; opened: boolean; teacherName: string | null; record: TeacherRecord;
  canRefresh: boolean; canCorrect: boolean;
  hidden: Record<string, string>; // the class's own fields for the forms (batch_id + class_date, or id)
  refreshAction: (form: FormData) => Promise<void>; correctAction: (form: FormData) => Promise<void>;
};

export function MeetCheckBox({ check, hasRoom, opened, teacherName, record, canRefresh, canCorrect, hidden, refreshAction, correctAction }: Props) {
  const line = meetLine(check, hasRoom, opened);
  if (!line && !record) return null;
  const fields = Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);
  return (
    <div className={styles.meetCheck}>
      {line && (
        <div className={styles.meetRow}>
          <p><strong>Google Meet:</strong> {line}</p>
          {canRefresh && hasRoom && opened && (
            <form action={refreshAction}>
              {fields}
              <button className={ui.secondaryButton}>Refresh from Meet</button>
            </form>
          )}
        </div>
      )}
      {record && (
        <div className={styles.meetRow}>
          <p><strong>Teacher{teacherName ? ` (${teacherName})` : ''}:</strong> {teacherLine(record)}</p>
          {canCorrect && (
            <details className={styles.history}>
              <summary>Correct the teacher&apos;s attendance</summary>
              <form action={correctAction} className={styles.correctForm}>
                {fields}
                <input type="hidden" name="record_id" value={record.id} />
                <select name="status" defaultValue={record.status === 'not_seen' ? 'on_time' : record.status} className={ui.select} aria-label="Teacher's attendance">
                  <option value="on_time">On time</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                </select>
                <input name="reason" required maxLength={300} className={ui.input} placeholder="Reason (for example: joined from another Google account)" aria-label="Reason for the change" />
                <button className={ui.button}>Save</button>
              </form>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
