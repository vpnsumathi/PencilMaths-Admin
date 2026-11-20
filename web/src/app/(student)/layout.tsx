import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { signOut } from '@/app/actions';
import { getUserId } from '@/lib/auth';
import { getMyDashboard } from './me/myDashboard';
import { getMyStudents } from './me/myStudents';
import { getMyUnread } from './me/myMessages';
import { AccountMenu } from './AccountMenu';
import { BottomNav } from './BottomNav';
import m from './phone.module.css';
import { StudentNav } from './StudentNav';
import { StudentSwitcher } from './StudentSwitcher';
import styles from './student.module.css';

// Every page inside (student) is for a signed-in student only. Staff go back to the staff portal.
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  if (!(await getUserId())) redirect('/login');

  // my_dashboard returns nothing for staff, unknown logins and students who have left (the page reuses it).
  // A family login can open several children; my_students lists them (cached: the home page reuses it).
  // getMyUnread: the number on the Messages tab, asked for at the same time.
  const [me, students, unread] = await Promise.all([getMyDashboard(), getMyStudents(), getMyUnread()]);
  if (!me) redirect('/');
  const name = `${me.first_name} ${me.last_name}`;

  return (
    <div className={styles.shell}>
      {/* Phones get a slim top bar (logo and the account button) and a tab bar along the bottom; bigger screens keep
          the tabs, name, Password and Sign out up here (guide 12, section 3.1). */}
      <header className={`${styles.topbar} ${m.bar}`}>
        {/* Logo file: web/public/logo.png (a copy is kept in the Logo folder at the top of the project). */}
        <Link href="/me" className={styles.brand} aria-label="PencilMaths: my dashboard">
          <Image src="/logo.png" alt="PencilMaths" width={136} height={45} priority className={m.logo} />
        </Link>
        <StudentNav unread={unread} />
        <div className={m.desktop}>
          {students.length > 1
            ? <StudentSwitcher students={students} />
            : <span className={styles.who} title={`Signed in as ${name}`}>{name}</span>}
          <Link href="/me/password" className={styles.signOut} title="Change password">🔑 Password</Link>
          <form action={signOut}>
            <button className={styles.signOut}>Sign out</button>
          </form>
        </div>
        <AccountMenu firstName={me.first_name} name={name} students={students} />
      </header>
      <main className={`${styles.main} ${m.mainPad}`}>{children}</main>
      <BottomNav unread={unread} />
    </div>
  );
}
