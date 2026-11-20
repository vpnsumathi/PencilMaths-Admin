'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import nav from './nav.module.css';
import m from './phone.module.css';
import styles from './student.module.css';

// The tabs in the top bar on bigger screens. Phones use BottomNav instead (this menu is hidden there).
// short: a shorter label on narrow screens.
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
    <nav className={`${styles.nav} ${m.desktopNav}`}>
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
