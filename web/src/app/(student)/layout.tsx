import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { signOut } from '@/app/actions';
import { createClient } from '@/lib/supabase/server';
import { StudentNav } from './StudentNav';
import { StudentSwitcher, type LinkedStudent } from './StudentSwitcher';
import styles from './student.module.css';

// Every page inside (student) is for a signed-in student only. Staff go back to the staff portal.
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Returns nothing for staff, unknown logins and students who have left.
  // A family login can open several children; my_students lists them.
  const [{ data: me }, { data: linked }] = await Promise.all([supabase.rpc('my_dashboard'), supabase.rpc('my_students')]);
  if (!me) redirect('/');
  const name = `${me.first_name} ${me.last_name}`;
  const students = (linked ?? []) as LinkedStudent[];

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        {/* Logo file: web/public/logo.png (a copy is kept in the Logo folder at the top of the project). */}
        <Link href="/me" className={styles.brand} aria-label="Pencil Maths: my dashboard">
          <Image src="/logo.png" alt="Pencil Maths" width={136} height={45} priority />
        </Link>
        <StudentNav />
        {students.length > 1
          ? <StudentSwitcher students={students} />
          : <span className={styles.who} title={`Signed in as ${name}`}>{name}</span>}
        <Link href="/me/password" className={styles.signOut} title="Change password">🔑 Password</Link>
        <form action={signOut}>
          <button className={styles.signOut}>Sign out</button>
        </form>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
