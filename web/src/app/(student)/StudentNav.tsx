'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import nav from './nav.module.css';
import styles from './student.module.css';

// short: the label on phones, where the four tabs share one row.
const LINKS = [
  { href: '/me', label: 'Dashboard' },
  { href: '/me/classes', label: 'Classes' },
  { href: '/me/homework', label: 'Homework' },
  { href: '/me/notes', label: 'Class Notes/Documents', short: 'Notes' },
];

export function StudentNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav}>
      {LINKS.map(({ href, label, short }) => {
        const active = pathname === href;
        return (
          <Link key={href} href={href} className={`${styles.link} ${active ? styles.active : ''}`}
            aria-current={active ? 'page' : undefined} aria-label={short ? label : undefined}>
            {short ? <><span className={nav.long}>{label}</span><span className={nav.short}>{short}</span></> : label}
          </Link>
        );
      })}
    </nav>
  );
}
