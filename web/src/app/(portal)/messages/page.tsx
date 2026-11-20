import Link from 'next/link';
import { Alerts } from '@/components/Alerts';
import ui from '@/components/ui.module.css';
import { requireStaff } from '@/lib/auth';
import { inboxTime, messagesMissing, MESSAGES_NOT_READY, officeUnread, sentLabel, studentsWord } from '@/lib/messages';
import { yearLabel } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import styles from './messages.module.css';

export const metadata = { title: 'Messages' };

type Props = { searchParams: Promise<{ view?: string; q?: string; before?: string; ok?: string; error?: string }> };
type Thread = {
  student_id: string; last_message_at: string; last_from: 'office' | 'student'; last_preview: string;
  last_student_at: string | null; office_read_at: string | null; office_read_by: string | null;
  students: { first_name: string; last_name: string; code: string; year_group: number; status: string };
};
type Broadcast = { id: string; audience: string; body: string; recipients: number; created_by_name: string | null; created_at: string };

// Rows per page; Older shows the next page from where this one ends.
const PAGE = 50;
const VIEWS = { reply: 'Needs reply', all: 'All', groups: 'Sent to groups' } as const;

// The staff inbox: one row per student conversation, newest first. "Needs reply" (the default) shows the
// conversations where the student wrote last; a dot marks ones no staff member has opened yet.
// "Sent to groups" lists messages sent to a batch, a year group, everyone or several chosen students.
export default async function MessagesPage({ searchParams }: Props) {
  await requireStaff();
  const { view: asked, q = '', before: beforeAsked, ok, error: problem } = await searchParams;
  const before = beforeAsked && !Number.isNaN(Date.parse(beforeAsked)) ? beforeAsked : null;
  const view = asked && asked in VIEWS ? (asked as keyof typeof VIEWS) : 'reply';
  const supabase = await createClient();
  // Only letters, numbers, spaces, hyphens and apostrophes, so the search can't break the filter.
  const search = q.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim();

  let threads = supabase.from('message_threads')
    .select('student_id, last_message_at, last_from, last_preview, last_student_at, office_read_at, office_read_by, students!inner(first_name, last_name, code, year_group, status)')
    .order('last_message_at', { ascending: false })
    .limit(PAGE + 1);
  if (before) threads = threads.lt('last_message_at', before);
  if (view === 'reply') threads = threads.eq('last_from', 'student');
  if (search) threads = threads.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,code.ilike.%${search}%`, { referencedTable: 'students' });

  let broadcasts = supabase.from('message_broadcasts').select('id, audience, body, recipients, created_by_name, created_at')
    .order('created_at', { ascending: false }).limit(PAGE + 1);
  if (before) broadcasts = broadcasts.lt('created_at', before);

  const [list, groups, waiting] = await Promise.all([
    view === 'groups' ? null : threads,
    view === 'groups' ? broadcasts : null,
    supabase.from('message_threads').select('student_id', { count: 'exact', head: true }).eq('last_from', 'student'),
  ]);
  const error = list?.error ?? groups?.error ?? null;
  if (error && !messagesMissing(error)) throw error;

  const allRows = (list?.data ?? []) as unknown as Thread[];
  const allSent = (groups?.data ?? []) as Broadcast[];
  const rows = allRows.slice(0, PAGE);
  const sent = allSent.slice(0, PAGE);
  // Paging: the link carries the view and search, and starts after the last row shown.
  const more = view === 'groups' ? allSent.length > PAGE : allRows.length > PAGE;
  const lastTime = view === 'groups' ? sent.at(-1)?.created_at : rows.at(-1)?.last_message_at;
  const pageLink = (from: string | null) => {
    const p = new URLSearchParams();
    if (view !== 'reply') p.set('view', view);
    if (search) p.set('q', search);
    if (from) p.set('before', from);
    const qs = p.toString();
    return qs ? `/messages?${qs}` : '/messages';
  };
  const shown = view === 'groups' ? sent.length : rows.length;

  return (
    <>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>Messages</h1>
          <p className={ui.subtitle}>Private conversations with students. Replies are only seen by staff.</p>
        </div>
        <Link href="/messages/new" className={ui.primaryButton}>New message</Link>
      </div>
      <Alerts ok={ok} problem={problem} />
      {error && <p className={`${ui.alert} ${ui.alertWarn}`}>{MESSAGES_NOT_READY}</p>}

      <nav className={styles.tabs} aria-label="Show">
        {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((v) => (
          <Link key={v} href={v === 'reply' ? '/messages' : `/messages?view=${v}`}
            className={`${styles.tab} ${view === v ? styles.tabActive : ''}`} aria-current={view === v ? 'page' : undefined}>
            {VIEWS[v]}{v === 'reply' && waiting.count ? ` (${waiting.count})` : ''}
          </Link>
        ))}
      </nav>

      {view !== 'groups' && (
        <form className={ui.filters}>
          {view !== 'reply' && <input type="hidden" name="view" value={view} />}
          <input name="q" defaultValue={q} placeholder="Search name or code" className={ui.input} aria-label="Search" />
          <button className={ui.button}>Search</button>
          {search && <Link href={view === 'reply' ? '/messages' : `/messages?view=${view}`} className={ui.link}>Clear</Link>}
        </form>
      )}

      {view !== 'groups' && (rows.length === 0 ? (
        <p className={ui.empty}>
          {search ? 'No conversations match that search.' : view === 'reply' ? 'Nothing waiting for a reply.' : 'No messages yet. Press New message to send one.'}
        </p>
      ) : (
        <ul className={styles.inbox}>
          {rows.map((t) => {
            const s = t.students;
            const unread = officeUnread(t.last_student_at, t.office_read_at);
            return (
              <li key={t.student_id}>
                <Link href={`/messages/${t.student_id}`} className={`${styles.row} ${unread ? styles.unread : ''}`}>
                  <span className={styles.avatar} aria-hidden="true">{(s.first_name[0] ?? '') + (s.last_name[0] ?? '')}</span>
                  <span className={styles.rowBody}>
                    <span className={styles.rowTop}>
                      <span>
                        <span className={styles.name}>{s.first_name} {s.last_name}</span>
                        <span className={styles.code}>{s.code} · {yearLabel(s.year_group)}{s.status === 'left' ? ' · Left' : ''}</span>
                      </span>
                      <span className={styles.time}>{inboxTime(t.last_message_at)}</span>
                    </span>
                    <p className={styles.preview}>{t.last_from === 'office' ? 'You: ' : ''}{t.last_preview}</p>
                    {unread
                      ? <p className={styles.status}><span className={ui.srOnly}>Unread. </span>Not opened by staff yet</p>
                      : t.last_from === 'student' && t.office_read_by && <p className={styles.status}>Opened by {t.office_read_by}</p>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ))}

      {view === 'groups' && (sent.length === 0 ? <p className={ui.empty}>No group messages yet.</p> : (
        <ul className={styles.inbox}>
          {sent.map((b) => (
            <li key={b.id} className={styles.row} style={{ display: 'block' }}>
              <div className={styles.rowTop}>
                <span><span className={styles.name}>{b.audience}</span><span className={styles.code}>{studentsWord(b.recipients)}</span></span>
                <span className={styles.time}>{sentLabel(b.created_at)}</span>
              </div>
              <p className={styles.groupBody}>{b.body}</p>
              <p className={styles.status}>Sent by {b.created_by_name ?? 'staff'}. Replies arrive in each student&apos;s own conversation.</p>
            </li>
          ))}
        </ul>
      ))}

      {!error && (more || before) && (
        <nav className={styles.paging} aria-label="More">
          <span className={styles.status}>
            Showing {shown} {before ? 'older' : 'newest'} {view === 'groups' ? 'group messages' : 'conversations'}
          </span>
          {before && <Link href={pageLink(null)} className={ui.link}>Back to newest</Link>}
          {more && lastTime && <Link href={pageLink(lastTime)} className={ui.link}>Older →</Link>}
        </nav>
      )}
    </>
  );
}
