import { FocusMessage } from '@/components/FocusMessage';
import { CLASS_WINDOW } from '@/lib/classLink';
import { ukNow } from '@/lib/liveClass';
import { checkAfterPage } from '@/lib/meetCheck';
import { yearLabel } from '@/lib/options';
import styles from '../student.module.css';
import type { Dashboard } from './dashboard';
import { ClassClock } from './_home/ClassClock';
import { Hero } from './_home/Hero';
import { greeting, longDate, nextChange, nextExtra, pickHero, upcoming, weekStrip } from './_home/model';
import { ClassCards, Corrected, ExtraStrip, LatestNotes, SectionHead, ToDo, Week } from './_home/Sections';
import h from './_home/home.module.css';
import { getMyDashboard } from './myDashboard';
import { getMyHome } from './myHome';
import { getMyUnread } from './myMessages';
import { getMyStudents } from './myStudents';

export const metadata = { title: 'My dashboard' };

// The student's home page (Help/12, section 3.2), in the order a student or parent needs it: the next class (the
// big "I'm here, open class" button during check-in), what to submit, this week, then how it is going. On a laptop
// the boxes sit in rows of two that line up (home.module.css).
// Database: my_dashboard, my_students and my_unread_messages are the layout's own answers (cached, no second call);
// my_home is the only call of this page. Nothing here waits for Google.
export default async function MyHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [me, home, unread, students] = await Promise.all([
    getMyDashboard() as Promise<Dashboard>, // the layout has already checked this is a student
    getMyHome(),
    getMyUnread(),
    getMyStudents(),
  ]);
  const now = new Date();
  const window = home?.window ?? me.class_window ?? CLASS_WINDOW;

  // Once the page is sent: check the student's own classes today whose check-in has opened with Google Meet, then
  // catch up on finished classes nobody looked at (guide 21, section 15). Nothing waits for Google.
  const uk = ukNow(now);
  checkAfterPage(me.classes
    .filter((c) => c.batch_id && c.times.some((t) => t.weekday === uk.weekday
      && uk.minute >= Number(t.start_time.slice(0, 2)) * 60 + Number(t.start_time.slice(3, 5)) - window.before_minutes))
    .map((c) => ({ kind: 'batch' as const, batchId: c.batch_id!, date: uk.date })));

  const extras = home?.extras ?? [];
  const list = upcoming(me.classes, extras, window, now);
  const hero = pickHero(list);
  const extra = nextExtra(list, hero, now);
  const next = list.filter((u) => u !== hero && u !== extra).slice(0, 2);
  const lessons = home?.next_lessons ?? [];
  const family = students.length > 1;

  return (
    <div className={h.home}>
      <ClassClock at={nextChange(list, window, now)} />
      <header className={h.hello}>
        <div>
          <h1>{family ? `${me.first_name}'s day` : `${greeting(now)}, ${me.first_name}`}</h1>
          <p>{longDate(uk.date)}</p>
        </div>
        <ul className={h.chips} aria-label="About you">
          <li>{yearLabel(me.year_group)}</li>
          {me.classes.map((c) => <li key={c.subject}>{c.subject}</li>)}
        </ul>
      </header>
      {error && <FocusMessage key={`error${Date.now()}`} className={styles.errorMsg} role="alert">{error}</FocusMessage>}

      {/* Phones: one column in this order. Laptops: three rows of two boxes that share their top and bottom edges
          (Up next | To do, My classes | This week, Recently corrected | Latest notes), see home.module.css. */}
      <div className={h.grid}>
        <section className={`${h.sec} ${h.aUp}`} aria-labelledby="up-next-h">
          <SectionHead id="up-next-h" title="Up next" href="/me/classes" link="All classes" />
          <Hero hero={hero} window={window} lessons={lessons} hasClasses={me.classes.length > 0} now={now} />
          {extra && <ExtraStrip item={extra} />}
        </section>
        <div className={h.aTodo}><ToDo home={home} toDoCount={me.homework.to_do} unread={unread} /></div>
        <div className={h.aWeek}><Week days={weekStrip(me.classes, home?.due_week ?? [], extras, now)} next={next} /></div>
        <div className={h.aCorrected}><Corrected items={me.homework.recently_marked} /></div>
        <div className={h.aClasses}><ClassCards me={me} lessons={lessons} /></div>
        <div className={h.aNotes}><LatestNotes notes={home?.notes ?? []} now={now} /></div>
      </div>
    </div>
  );
}
