import Link from 'next/link';
import { AlertIcon, BookIcon, CheckCircleIcon, ClipboardCheckIcon, MessageIcon } from '@/components/icons';
import { KIND_LABEL } from '@/lib/extraClasses';
import { clock12 } from '@/lib/format';
import type { Dashboard } from '../dashboard';
import { JoinExtraButton } from '../classes/JoinExtraButton';
import {
  isNew, percent, shortDate, timesText, ukDateOf, type Home, type HomeNote, type NextLesson, type Upcoming, type WeekDay,
} from './model';
import h from './home.module.css';

// The home page's sections below the Up next card (Help/12, section 3.2). Server components: no JavaScript is sent.

export function SectionHead({ id, title, count, href, link }: { id: string; title: string; count?: number; href: string; link: string }) {
  return (
    <div className={h.sh}>
      <h2 id={id}>{title}{count ? <span className={h.count}>{count}</span> : null}</h2>
      <Link href={href}>{link} <span aria-hidden="true">→</span></Link>
    </div>
  );
}

// The extra class under the Up next card (violet), with its own join button while check-in is open.
export function ExtraStrip({ item }: { item: Extract<Upcoming, { kind: 'extra' }> }) {
  const x = item.extra;
  return (
    <div className={h.extra}>
      <span className={h.tag}>Extra</span>
      <Link href="/me/classes" className={h.grow}>
        <b>{x.subject} {KIND_LABEL[x.kind].toLowerCase()} · {shortDate(item.date)}, {item.time}</b>
        <small>{x.length_minutes} min with {x.teacher}</small>
      </Link>
      {x.in_window && <JoinExtraButton id={x.id} back="/me" className={h.go} />}
    </div>
  );
}

// To do: overdue homework first, then by due date (my_home), each with its own Submit, and new messages.
export function ToDo({ home, toDoCount, unread }: { home: Home | null; toDoCount: number; unread: number }) {
  const rows = home?.to_do ?? [];
  const total = (home?.to_do_total ?? toDoCount) + (unread > 0 ? 1 : 0);
  return (
    <section className={h.sec} aria-labelledby="to-do">
      <SectionHead id="to-do" title="To do" count={total} href="/me/homework" link="All homework" />
      <div className={`${h.card} ${h.list}`}>
        {rows.map((r) => (
          <Link key={r.sheet_id} href={`/me/homework#hw-${r.sheet_id}`} aria-label={`Submit ${r.title}`}>
            <span className={`${h.ico} ${r.overdue ? h.icoRed : h.icoAmber}`} aria-hidden="true">
              {r.overdue ? <AlertIcon /> : <ClipboardCheckIcon />}
            </span>
            <span className={h.grow}>
              <b>{r.title}</b>
              <small>
                {r.subject} · {r.due_on
                  ? <span className={r.overdue ? h.red : undefined}>{r.overdue ? 'Overdue: was due' : 'Due'} {shortDate(r.due_on)}</span>
                  : 'No due date'}
              </small>
            </span>
            <span className={h.go}>Submit</span>
          </Link>
        ))}
        {/* Without the student home script, the count from my_dashboard still leads to My homework. */}
        {!home && toDoCount > 0 && (
          <Link href="/me/homework">
            <span className={`${h.ico} ${h.icoAmber}`} aria-hidden="true"><ClipboardCheckIcon /></span>
            <span className={h.grow}><b>{toDoCount} homework to submit</b><small>Open My homework to submit it</small></span>
            <span className={h.go}>Open</span>
          </Link>
        )}
        {unread > 0 && (
          <Link href="/me/messages">
            <span className={`${h.ico} ${h.icoBrand}`} aria-hidden="true"><MessageIcon /></span>
            <span className={h.grow}><b>{unread === 1 ? '1 new message' : `${unread} new messages`}</b><small>From PencilMaths</small></span>
            <span className={`${h.go} ${h.goSoft}`}>Read</span>
          </Link>
        )}
        {rows.length === 0 && toDoCount === 0 && unread === 0 && (
          <p className={h.allDone}><CheckCircleIcon /> All done. Nothing to submit right now.</p>
        )}
        {home && home.to_do_total > rows.length && (
          <Link href="/me/homework" className={h.more}>{home.to_do_total - rows.length} more to submit</Link>
        )}
      </div>
    </section>
  );
}

// This week: Monday to Sunday with dots, then the next two things coming up.
export function Week({ days, next }: { days: WeekDay[]; next: Upcoming[] }) {
  return (
    <section className={h.sec} aria-labelledby="this-week">
      <SectionHead id="this-week" title="This week" href="/me/classes" link="Classes" />
      <div className={h.card}>
        <ol className={h.week}>
          {days.map((d) => {
            const what = [d.hasClass && 'class', d.hasHomework && 'homework due', d.hasExtra && 'extra class'].filter(Boolean).join(', ');
            return (
              <li key={d.date} className={`${h.day} ${d.today ? h.today : ''} ${d.past ? h.past : ''}`}
                aria-label={`${d.label} ${d.day}${d.today ? ', today' : ''}${what ? `: ${what}` : ''}`}
                aria-current={d.today ? 'date' : undefined}>
                {d.label}<strong>{d.day}</strong>
                <span className={h.dots} aria-hidden="true">
                  {d.hasClass && <i className={h.dClass} />}{d.hasHomework && <i className={h.dHw} />}{d.hasExtra && <i className={h.dExtra} />}
                </span>
              </li>
            );
          })}
        </ol>
        <p className={h.legend} aria-hidden="true">
          <span><i className={h.dClass} />Class</span><span><i className={h.dHw} />Homework due</span><span><i className={h.dExtra} />Extra class</span>
        </p>
        {next.length > 0 && (
          <>
            <p className={h.wl}>Coming up</p>
            <div className={h.list}>
              {next.map((u) => (
                <div key={u.kind === 'class' ? `${u.cls.subject}-${u.date}-${u.time}` : u.extra.id}>
                  <span className={`${h.ico} ${h.icoDay} ${u.kind === 'extra' ? h.icoViolet : h.icoBrand}`} aria-hidden="true">
                    {shortDate(u.date).slice(0, 3).toUpperCase()}
                  </span>
                  <span className={h.grow}>
                    <b>{u.kind === 'class' ? `${u.cls.subject} · ${clock12(u.time)}` : `${u.extra.subject} ${KIND_LABEL[u.extra.kind].toLowerCase()} · ${u.time}`}</b>
                    <small>
                      {shortDate(u.date)} · {u.kind === 'class'
                        ? `${u.cls.teacher ?? 'Teacher to be confirmed'}${u.cls.topic ? ` · ${u.cls.topic}` : ''}`
                        : `Extra class · ${u.extra.length_minutes} min · ${u.extra.teacher}`}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// Recently corrected (last 14 days, from my_dashboard): the mark, with a ring for the percentage.
export function Corrected({ items }: { items: Dashboard['homework']['recently_marked'] }) {
  if (items.length === 0) return null;
  return (
    <section className={h.sec} aria-labelledby="corrected">
      <SectionHead id="corrected" title="Recently corrected" href="/me/homework?tab=marked" link="See all" />
      <div className={`${h.card} ${h.list}`}>
        {items.map((m) => {
          const p = percent(m.mark, m.max_mark);
          return (
            <Link key={`${m.title}-${m.marked_on}`} href="/me/homework?tab=marked">
              {p !== null
                ? <span className={h.ring} style={{ '--p': p } as React.CSSProperties} aria-hidden="true">{p}%</span>
                : <span className={`${h.ico} ${h.icoGreen}`} aria-hidden="true"><CheckCircleIcon /></span>}
              <span className={h.grow}><b>{m.title}</b><small>{m.subject} · corrected {shortDate(m.marked_on)}</small></span>
              <span className={h.score}>{m.mark !== null ? `${m.mark}${m.max_mark ? ` / ${m.max_mark}` : ''}` : 'Corrected'}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

const BADGES = [h.b0, h.b1, h.b2, h.b3];

// My classes: one card per class with the topic, the next lesson, attendance and homework left.
export function ClassCards({ me, lessons }: { me: Dashboard; lessons: NextLesson[] }) {
  if (me.classes.length === 0) return null;
  return (
    <section className={h.sec} aria-labelledby="my-classes">
      <SectionHead id="my-classes" title="My classes" href="/me/classes" link="Details" />
      <div className={h.classes}>
        {me.classes.map((c, i) => {
          const a = c.attendance;
          const lesson = lessons.find((l) => l.batch_id === c.batch_id);
          const pct = a && a.total > 0 ? Math.round(((a.present + a.late) / a.total) * 100) : null;
          return (
            <article key={c.subject} className={`${h.card} ${h.cls}`} aria-labelledby={`cls-${i}`}>
              <div className={h.clsHead}>
                <span className={`${h.badge} ${BADGES[i % BADGES.length]}`} aria-hidden="true">{c.subject.charAt(0)}</span>
                <div>
                  <h3 id={`cls-${i}`}>{c.subject}{c.batch_code ? ` · ${c.batch_code}` : ''}</h3>
                  <p>{c.teacher ?? 'Teacher to be confirmed'} · {timesText(c.times)}</p>
                </div>
              </div>
              <dl>
                <dt>Topic now</dt><dd>{c.topic ?? 'To be confirmed'}</dd>
                {lesson && <><dt>{lesson.status === 'in_progress' ? 'This lesson' : 'Next lesson'}</dt>
                  <dd>{lesson.class_no ? `Class ${lesson.class_no} · ` : ''}{lesson.name}{lesson.planned_on ? ` · ${shortDate(lesson.planned_on)}` : ''}</dd></>}
                {a && <><dt>Attendance</dt><dd>
                  {pct === null ? 'No classes recorded yet' : <>{a.present + a.late} of {a.total} classes
                    <span className={h.bar} role="img" aria-label={`${pct}% attended`}><i style={{ width: `${pct}%` }} /></span></>}
                </dd></>}
                <dt>Homework</dt><dd className={c.to_do > 0 ? h.red : h.green}>{c.to_do > 0 ? `${c.to_do} to submit` : 'All submitted'}</dd>
              </dl>
              <div className={h.clsLinks}>
                <Link href={`/me/lesson-plan?subject=${encodeURIComponent(c.subject)}`}>Lesson plan</Link>
                <Link href={`/me/notes?subject=${encodeURIComponent(c.subject)}`}>Notes</Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// Latest notes: the 2 newest class notes or personal notes, New when added in the last 7 days.
export function LatestNotes({ notes, now }: { notes: HomeNote[]; now: Date }) {
  if (notes.length === 0) return null;
  return (
    <section className={h.sec} aria-labelledby="latest-notes">
      <SectionHead id="latest-notes" title="Latest notes" href="/me/notes" link="All notes" />
      <div className={`${h.card} ${h.list}`}>
        {notes.map((n) => (
          <Link key={n.id} href={n.subject ? `/me/notes?subject=${encodeURIComponent(n.subject)}` : '/me/notes'}>
            <span className={`${h.ico} ${n.for_you ? h.icoGreen : h.icoBrand}`} aria-hidden="true"><BookIcon /></span>
            <span className={h.grow}>
              <b>{n.title}
                {n.for_you ? <span className={h.new}>Just for you</span> : isNew(n.created_at, now) && <span className={h.new}>New</span>}
              </b>
              <small>{n.subject ?? 'Personal'} · added {shortDate(ukDateOf(n.created_at))}</small>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
