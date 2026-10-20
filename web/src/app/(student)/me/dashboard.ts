// The shape my_dashboard() returns (see supabase/migrations/20261020000003_student_dashboard_tiles.sql).
export type StudentClass = {
  subject: string; batch_code: string | null; teacher: string | null; class_year: number | null;
  started_on: string; times: { weekday: number; start_time: string }[]; to_do: number; marked: number;
  topic?: string | null; topic_started?: boolean;
};

export type Dashboard = {
  first_name: string; last_name: string; code: string; year_group: number; school: string | null;
  classes: StudentClass[];
  homework: {
    to_do: number; overdue: number; handed_in: number;
    recently_marked: { title: string; subject: string; mark: number | null; max_mark: number | null; marked_on: string }[];
  };
};

// The next class from the weekly times, in UK time: { date: "2026-10-21", time: "17:00", label: "Tomorrow, 17:00" }.
export function nextClass(times: StudentClass['times'], now = new Date()) {
  if (times.length === 0) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1;
  const nowTime = `${parts.hour}:${parts.minute}`;

  let best: { days: number; time: string } | null = null;
  for (const t of times) {
    const time = t.start_time.slice(0, 5);
    let days = (t.weekday - weekday + 7) % 7;
    if (days === 0 && time <= nowTime) days = 7; // today's class has already started
    if (!best || days < best.days || (days === best.days && time < best.time)) best = { days, time };
  }
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + best!.days);
  const day = best!.days === 0 ? 'Today' : best!.days === 1 ? 'Tomorrow'
    : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return { date: d.toISOString().slice(0, 10), time: best!.time, label: `${day}, ${best!.time}` };
}
