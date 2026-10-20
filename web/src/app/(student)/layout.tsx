import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { signOut } from '@/app/actions';
import { createClient } from '@/lib/supabase/server';
import { StudentNav } from './StudentNav';
import styles from './student.module.css';

// Every page inside (student) is for a signed-in student only. Staff go back to the staff portal.
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Returns nothing for staff, unknown logins and students who have left.
  const { data: me } = await supabase.rpc('my_dashboard');
  if (!me) redirect('/');
  const name = `${me.first_name} ${me.last_name}`;

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        {/* Logo file: web/public/logo.png (a copy is kept in the Logo folder at the top of the project). */}
        <Link href="/me" className={styles.brand} aria-label="Pencil Maths: my dashboard">
          <Image src="/logo.png" alt="Pencil Maths" width={136} height={45} priority />
        </Link>
        <StudentNav />
        <span className={styles.who} title={`Signed in as ${name}`}>{name}</span>
        <form action={signOut}>
          <button className={styles.signOut}>Sign out</button>
        </form>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
