// The class link: the Google Classroom (or Google Meet) address a batch uses for its online class.
// Used when staff save a link on the batch page and again just before a student is sent to it.
// The database checks the same thing (batches_class_link_check), so a link that isn't Google's can never be stored.

const ALLOWED_HOSTS = ['classroom.google.com', 'meet.google.com'];

export const CLASS_LINK_HELP =
  'Paste the link from Google Classroom or Google Meet. It starts with https://classroom.google.com/ or https://meet.google.com/.';

// A pasted link, tidied: the full https address, or null if it isn't a Google Classroom or Google Meet link.
export function cleanClassLink(value: string | null | undefined): string | null {
  const pasted = (value ?? '').trim();
  if (!pasted || pasted.length > 500 || /\s/.test(pasted)) return null;
  let url: URL;
  try {
    url = new URL(pasted);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.includes(url.hostname) || url.username || url.password || url.port) return null;
  return url.href;
}

// The numbers behind "during class", as the database gives them (class_window in the attendance script).
export type ClassWindow = { before_minutes: number; after_minutes: number; late_minutes: number };
// The same numbers as the database's class_window(): check-ins from 15 minutes before the start to 60 after,
// late after 10. For pages that don't ask the database (the Class Schedule page, Join class going to Meet).
export const CLASS_WINDOW: ClassWindow = { before_minutes: 15, after_minutes: 60, late_minutes: 10 };

// "16:00:00" plus or minus some minutes → "15:45". Class times never run across midnight.
export function shiftTime(time: string, minutes: number) {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(Math.max(h * 60 + m + minutes, 0), 24 * 60 - 1);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Attendance totals as attendance_totals() and my_dashboard() return them.
// checked_in: portal check-ins the teacher hasn't confirmed yet; they already count in present / late.
export type AttendanceTotals = {
  present: number; late: number; absent: number; total: number; checked_in?: number;
  recent: { class_date: string; status: 'present' | 'late' | 'absent'; source?: 'auto' | 'link' | 'staff' }[];
};

export const ATTENDANCE_LABEL: Record<string, string> = { present: 'Present', late: 'Late', absent: 'Absent' };
// Badge colour (see StatusBadge) for each attendance status.
export const ATTENDANCE_TONE: Record<string, string> = { present: 'active', late: 'trial', absent: 'left' };

// One class's mark in words. A portal check-in counts as attended, but says "Checked in" until the teacher confirms it.
export function markLabel(status: string, source?: string | null) {
  if (source === 'link') return status === 'late' ? 'Checked in late' : 'Checked in';
  return ATTENDANCE_LABEL[status] ?? status;
}
// Badge colour for markLabel.
export function markTone(status: string, source?: string | null) {
  return source === 'link' ? 'in_progress' : ATTENDANCE_TONE[status] ?? 'closed';
}

// "Attended 10 of 12 classes · 1 late · 2 absent · 1 checked in, not yet confirmed"
export function attendanceLine(a: AttendanceTotals | null | undefined) {
  if (!a || a.total === 0) return 'No classes recorded yet';
  const attended = a.present + a.late;
  return `Attended ${attended} of ${a.total} ${a.total === 1 ? 'class' : 'classes'}`
    + (a.late > 0 ? ` · ${a.late} late` : '') + (a.absent > 0 ? ` · ${a.absent} absent` : '')
    + (a.checked_in ? ` · ${a.checked_in} checked in, not yet confirmed` : '');
}

// The class happening now (UK time): a weekly class time whose check-in times we are in, from shortly before the
// start to the end of the window. label: "Starting soon · 16:00" before the start, "Class now · started 16:00" after.
// Only for what the page shows: the database decides what really counts when the button is pressed.
export function currentClass(times: { weekday: number; start_time: string }[], window: ClassWindow | undefined, now = new Date()) {
  if (!window) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1;
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  for (const t of times) {
    const [h, m] = t.start_time.split(':').map(Number);
    const start = h * 60 + m;
    if (t.weekday === weekday && minute >= start - window.before_minutes && minute <= start + window.after_minutes) {
      const time = t.start_time.slice(0, 5);
      return { time, started: minute >= start, label: minute >= start ? `Class now · started ${time}` : `Starting soon · ${time}` };
    }
  }
  return null;
}

// Is it check-in time right now? Decides the button's words ("I'm here, open class" or "Open classroom").
export function checkInOpen(times: { weekday: number; start_time: string }[], window: ClassWindow | undefined, now = new Date()) {
  return currentClass(times, window, now) !== null;
}
