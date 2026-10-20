'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './student.module.css';

const LINKS = [
  { href: '/me', label: 'Dashboard' },
  { href: '/me/classes', label: 'Classes' },
  { href: '/me/homework', label: 'Homework' },
];

export function StudentNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav}>
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link key={href} href={href} className={`${styles.link} ${active ? styles.active : ''}`}
            aria-current={active ? 'page' : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
