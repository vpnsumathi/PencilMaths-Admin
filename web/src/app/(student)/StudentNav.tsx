'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import nav from './nav.module.css';
import styles from './student.module.css';

// short: the label on phones, where the tabs share one row.
const LINKS = [
  { href: '/me', label: 'Dashboard' },
  { href: '/me/classes', label: 'Classes' },
  { href: '/me/homework', label: 'Homework' },
  { href: '/me/lesson-plan', label: 'Lesson Plan', short: 'Plan' },
  { href: '/me/notes', label: 'Class Notes/Documents', short: 'Notes' },
  { href: '/me/messages', label: 'Messages', short: 'Inbox' },
];

// unread: messages from PencilMaths not seen yet, shown on the Messages tab (not while that page is open).
export function StudentNav({ unread = 0 }: { unread?: number }) {
  const pathname = usePathname();
  return (
    <nav className={styles.nav}>
      {LINKS.map(({ href, label, short }) => {
        const active = pathname === href;
        const count = href === '/me/messages' && !active ? unread : 0;
        return (
          <Link key={href} href={href} className={`${styles.link} ${active ? styles.active : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={count > 0 ? `${label}, ${count} new` : short ? label : undefined}>
            {short ? <><span className={nav.long}>{label}</span><span className={nav.short}>{short}</span></> : label}
            {count > 0 && <span className={nav.badge} aria-hidden="true">{count > 99 ? '99+' : count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
