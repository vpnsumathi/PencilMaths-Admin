import type { Metadata } from 'next';
import Image from 'next/image';
import { LoginForm } from './LoginForm';
import styles from './login.module.css';
import { CalendarIcon, ClipboardCheckIcon, UsersIcon } from '@/components/icons';

export const metadata: Metadata = { title: 'Sign in' };

const FEATURES = [
  { icon: UsersIcon, title: 'Students & families', text: 'Profiles, parent contacts and notes in one place.' },
  { icon: CalendarIcon, title: 'Batches & classes', text: 'Weekly schedules, attendance and lesson plans.' },
  { icon: ClipboardCheckIcon, title: 'Homework & progress', text: 'Track what is set, received and marked.' },
];

const SYMBOLS = ['+', '÷', '×', 'π', '√', '∑', '=', '%'];

export default function LoginPage() {
  return (
    <div className={styles.shell}>
      {/* Left: brand panel (shown on larger screens only) */}
      <aside className={styles.brandPanel}>
        <div className={styles.symbols} aria-hidden="true">
          {SYMBOLS.map((s, i) => <span key={i}>{s}</span>)}
        </div>

        <div className={styles.brandTop}>
          <Image className={styles.logo} src="/logo-on-dark.png" alt="Pencil Maths" width={163} height={54} priority />
        </div>

        <div className={styles.brandBody}>
          <h2 className={styles.headline}>Every student, class and teacher. One place.</h2>
          <p className={styles.lead}>The operations portal for the PencilMaths team.</p>
          <ul className={styles.features}>
            {FEATURES.map(({ icon: FeatureIcon, title, text }) => (
              <li key={title}>
                <span className={styles.featureIcon}><FeatureIcon size={18} /></span>
                <div><b>{title}</b><span>{text}</span></div>
              </li>
            ))}
          </ul>
        </div>

        <p className={styles.brandFoot}>© {new Date().getFullYear()} Pencil Maths</p>
      </aside>

      {/* Right: the sign-in form */}
      <main className={styles.formSide}>
        <div className={styles.mobileBrand}>
          <Image className={styles.logo} src="/logo-transparent.png" alt="Pencil Maths" width={163} height={54} priority />
        </div>
        <LoginForm />
      </main>
    </div>
  );
}
