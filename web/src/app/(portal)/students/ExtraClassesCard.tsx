import Link from 'next/link';
import ui from '@/components/ui.module.css';
import { termStart } from '@/lib/attendanceReport';
import { KIND_LABEL, NOT_READY, shortWhen, ukClock, ukDate, type ListResult } from '@/lib/extraClasses';
import { todayInUk } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { ExtraStatusPill, Result } from '../extra-classes/bits';
import styles from '../extra-classes/extra.module.css';

// The student page's Extra classes card (guide 24), under the Attendance card. It stays the same size however many
// there are: the next 3, the last 5 taken with this student's result, and this term's counts. Staff can book from
// it; a teacher sees only the extra classes they teach (the database decides).
export async function ExtraClassesCard({ studentId, staff }: { studentId: string; staff: boolean }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('extra_class_list', { p: { student: studentId, page_size: 500 } });
  if (error) console.error('Extra classes card:', error.message);
  const head = (
    <div className={ui.header} style={{ marginBottom: 8 }}>
      <h2 style={{ margin: 0 }}>Extra classes{staff ? '' : <span className={ui.muted} style={{ fontWeight: 400, fontSize: 14 }}> · yours</span>}</h2>
      {staff && (
        <div className={ui.formActions}>
          <Link href={`/extra-classes/new?student=${studentId}&recorded=1`} className={ui.button}>Record a past one</Link>
          <Link href={`/extra-classes/new?student=${studentId}`} className={ui.primaryButton}>Create extra class</Link>
        </div>
      )}
    </div>
  );
  if (error) {
    return (
      <section className={ui.card} style={{ marginBottom: 16, maxWidth: 900 }}>
        {head}
        <p className={ui.empty}>{error.code === 'PGRST202' ? NOT_READY : 'The extra classes could not be loaded.'}</p>
      </section>
    );
  }

  const list = data as ListResult;
  const now = Date.now();
  const mine = (r: ListResult['rows'][number]) => r.students.find((s) => s.id === studentId);
  const upcoming = list.rows.filter((r) => r.status === 'upcoming' || r.status === 'live').slice(0, 3);
  const taken = list.rows.filter((r) => r.status !== 'cancelled' && new Date(r.ends_at).getTime() < now).slice(0, 5);
  const term = termStart(todayInUk());
  const inTerm = list.rows.filter((r) => ukDate(r.starts_at) >= term);
  const termTaken = inTerm.filter((r) => r.status !== 'cancelled' && new Date(r.ends_at).getTime() < now);
  const termAbsent = termTaken.filter((r) => mine(r)?.mark === 'absent').length;
  const termCancelled = inTerm.filter((r) => r.status === 'cancelled').length;

  return (
    <section id="extra-classes" className={ui.card} style={{ marginBottom: 16, maxWidth: 900 }}>
      {head}
      {list.total === 0 ? (
        <p className={ui.empty} style={{ margin: 0 }}>No extra classes yet.</p>
      ) : (
        <>
          <p className={styles.miniTitle}>Upcoming</p>
          {upcoming.length === 0 ? <p className={ui.muted} style={{ margin: 0, fontSize: 14 }}>None coming up.</p> : (
            <ul className={styles.mini}>
              {upcoming.map((r) => (
                <li key={r.id}>
                  <span><Link href={`/extra-classes/${r.id}`} className={ui.link}>{shortWhen(r.starts_at)}–{ukClock(r.ends_at)}</Link> · {r.subject} · {KIND_LABEL[r.kind]}{staff ? ` · ${r.teacher}` : ''}</span>
                  <ExtraStatusPill status={r.status} />
                </li>
              ))}
            </ul>
          )}
          <p className={styles.miniTitle}>Taken</p>
          {taken.length === 0 ? <p className={ui.muted} style={{ margin: 0, fontSize: 14 }}>None yet.</p> : (
            <ul className={styles.mini}>
              {taken.map((r) => {
                const me = mine(r);
                return (
                  <li key={r.id}>
                    <span><Link href={`/extra-classes/${r.id}`} className={ui.link}>{shortWhen(r.starts_at)}</Link> · {r.subject} · {KIND_LABEL[r.kind]}{staff ? ` · ${r.teacher}` : ''}</span>
                    <Result mark={me?.mark ?? null} source={me?.mark_source ?? null} />
                  </li>
                );
              })}
            </ul>
          )}
          <div className={styles.foot}>
            <span className={ui.muted}>
              This term: {termTaken.length} taken · {termAbsent} absent · {termCancelled} cancelled. Not part of the weekly attendance figure.
            </span>
            <Link href={`/extra-classes?student=${studentId}&range=all`} className={ui.link}>See all {list.total} in Extra classes →</Link>
          </div>
        </>
      )}
    </section>
  );
}
