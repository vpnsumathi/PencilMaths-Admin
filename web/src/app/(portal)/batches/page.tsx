import Link from 'next/link';
import { Alerts } from '@/components/Alerts';
import { CreatedModified } from '@/components/CreatedModified';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { isTeacher } from '@/lib/auth';
import { CLASS_WINDOW, cleanClassLink, currentClass } from '@/lib/classLink';
import { formatDate, times12 } from '@/lib/format';
import { yearShort } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Batches' };

type Props = { searchParams: Promise<{ ok?: string; error?: string }> };

export default async function BatchesPage({ searchParams }: Props) {
  const { ok, error: problem } = await searchParams;
  const supabase = await createClient();
  // Teachers only get their own open batches back (database rules), and can't add batches.
  // batch_list is a database view: each batch with its teacher, members, schedule and progress.
  // Who is looking is worked out at the same time as the list loads, not before it.
  const [teacher, { data: batches, error }, { data: classLinks }, { data: classrooms }, { data: meetRooms }] = await Promise.all([
    isTeacher(),
    supabase
      .from('batch_list')
      .select('id, code, name, subject, year_group, teacher, capacity, member_count, schedule, topics_done, topics_total, last_class_on, closed_on, created_at, updated_at')
      .order('closed_on', { ascending: false, nullsFirst: true })
      .order('code'),
    // Open batches that have a Google Classroom link, for Join class in the list. Asked for separately so the
    // list still opens before the database script for it (20261111000001_class_link_attendance.sql) has been run.
    supabase.from('batches').select('id, class_link, teacher_id, batch_slots(weekday, start_time)').not('class_link', 'is', null).is('closed_on', null),
    // Classes the app created (Create Google Classroom): staff and teachers open those with the class's own address.
    supabase.from('batch_classrooms').select('batch_id, teacher_link, teacher_status, teacher_id, course_state'),
    // Batches with a Meet room (guide 21, section 12): at class time their Join class opens the room.
    supabase.from('batch_meet_rooms').select('batch_id'),
  ]);
  if (error) throw error;
  const open = batches.filter((b) => !b.closed_on);
  const closed = batches.filter((b) => b.closed_on);
  const created = new Map((classrooms ?? []).map((c) => [c.batch_id as string, c]));
  const withRoom = new Set((meetRooms ?? []).map((r) => r.batch_id as string));
  // The students' link is the class's invite link, so a teacher only gets the class's own address, and only once
  // Google says they have joined it.
  const joinLinks = new Map((classLinks ?? []).map((b) => {
    if (withRoom.has(b.id as string) && currentClass(b.batch_slots ?? [], CLASS_WINDOW)) return [b.id as string, `/batches/${b.id}/meet`];
    const c = created.get(b.id as string);
    if (!c) return [b.id as string, cleanClassLink(b.class_link as string | null)];
    const allowed = c.course_state === 'ACTIVE' && (!teacher || (c.teacher_status === 'joined' && c.teacher_id === b.teacher_id));
    return [b.id as string, allowed ? cleanClassLink(c.teacher_link as string | null) : null];
  }));

  // One table for open or closed batches. Closed batches have no class to join, so they show the date they closed instead.
  const batchTable = (rows: typeof open, isClosed: boolean) => (
    <div className={ui.tableWrap}>
      <table className={ui.table}>
        <thead>
          <tr><th>Batch</th><th>Subject</th><th>Year</th>{!teacher && <th>Teacher</th>}<th>Times</th>{!isClosed && <th>Class</th>}<th>Places</th><th>Lesson plan</th><th>Last class</th><th>{isClosed ? 'Closed on' : 'Status'}</th><th>Created / modified</th></tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <td><Link href={`/batches/${b.id}`} className={ui.link}>{b.code}</Link>{b.name && <span className={ui.muted}> · {b.name}</span>}</td>
              <td>{b.subject}</td>
              <td>{yearShort(b.year_group)}</td>
              {!teacher && <td>{b.teacher}</td>}
              <td>{times12(b.schedule) ?? '—'}</td>
              {!isClosed && (
                <td>
                  {joinLinks.get(b.id)
                    ? <a href={joinLinks.get(b.id)!} target="_blank" rel="noopener noreferrer" className={ui.link}>Join class</a>
                    : <span className={ui.muted}>—</span>}
                </td>
              )}
              <td>{b.member_count} / {b.capacity}</td>
              <td>{b.topics_done} of {b.topics_total} done</td>
              <td>{formatDate(b.last_class_on)}</td>
              <td>{isClosed ? formatDate(b.closed_on) : <StatusBadge status="open" label="Open" />}</td>
              <td><CreatedModified created={b.created_at} updated={b.updated_at} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className={ui.header}>
        <h1 className={ui.title}>{teacher ? 'My batches' : 'Batches'}</h1>
        {!teacher && <Link href="/batches/new" className={ui.primaryButton}>New batch</Link>}
      </div>
      <Alerts ok={ok} problem={problem} />

      {batches.length === 0 ? <p className={ui.empty}>{teacher ? 'No batches are assigned to you yet.' : 'No batches yet.'}</p> : (
        <>
          {/* Open batches first; closed ones get their own section below (teachers only ever see open ones). */}
          {open.length === 0 ? <p className={ui.empty}>No open batches.</p> : batchTable(open, false)}
          {closed.length > 0 && (
            <>
              <h2 style={{ margin: '28px 0 12px', fontSize: 18 }}>Closed batches ({closed.length})</h2>
              {batchTable(closed, true)}
            </>
          )}
        </>
      )}
    </>
  );
}

