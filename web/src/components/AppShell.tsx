'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { signOut } from '@/app/actions';
import styles from './AppShell.module.css';
import {
  BookIcon, CalendarIcon, CalendarPlusIcon, ClipboardCheckIcon, ClipboardListIcon, HomeIcon, LogOutIcon, MailIcon, MenuIcon, MessageIcon, PencilIcon, SettingsIcon, ShieldCheckIcon, UploadIcon, UsersIcon, XIcon,
} from './icons';

type Staff = { full_name: string; role: string };
type NavLink = { href: string; label: string; icon: (p: { size?: number }) => React.ReactNode; ready: boolean; children?: NavLink[] };

// Sidebar links. ready: false shows the link greyed out until that screen is built.
const NAV: NavLink[] = [
  { href: '/', label: 'Dashboard', icon: HomeIcon, ready: true },
  { href: '/students', label: 'Students', icon: UsersIcon, ready: true },
  { href: '/teachers', label: 'Teachers', icon: PencilIcon, ready: true },
  { href: '/batches', label: 'Batches', icon: CalendarIcon, ready: true },
  { href: '/attendance', label: 'Attendance', icon: ClipboardCheckIcon, ready: true },
  { href: '/homework-tracker', label: 'Homework Tracker', icon: ClipboardListIcon, ready: true },
  { href: '/class-schedule', label: 'Class Schedule', icon: CalendarIcon, ready: true },
  { href: '/extra-classes', label: 'Extra classes', icon: CalendarPlusIcon, ready: true },
  // Messages with students (Help/29). Staff only: teachers do not message (decided 20 Nov 2026).
  { href: '/messages', label: 'Messages', icon: MessageIcon, ready: true },
  { href: '/enquiries', label: 'Enquiries', icon: MailIcon, ready: true },
];
const ADMIN_NAV: NavLink[] = [
  { href: '/subjects', label: 'Subjects', icon: BookIcon, ready: true },
  { href: '/lesson-library', label: 'Lesson library', icon: BookIcon, ready: true },
  // Settings opens to show its pages while one of them is in use.
  {
    href: '/settings', label: 'Settings', icon: SettingsIcon, ready: true, children: [
      { href: '/settings/staff', label: 'Staff', icon: ShieldCheckIcon, ready: true },
      { href: '/settings/import', label: 'Bulk import', icon: UploadIcon, ready: true },
    ],
  },
];
// Teachers see only their own batches and the students in them.
const TEACHER_NAV: NavLink[] = [
  { href: '/', label: 'Dashboard', icon: HomeIcon, ready: true },
  { href: '/batches', label: 'My batches', icon: CalendarIcon, ready: true },
  { href: '/students', label: 'My students', icon: UsersIcon, ready: true },
  { href: '/attendance', label: 'Attendance', icon: ClipboardCheckIcon, ready: true },
  { href: '/class-schedule', label: 'Class Schedule', icon: CalendarIcon, ready: true },
  { href: '/extra-classes', label: 'Extra classes', icon: CalendarPlusIcon, ready: true },
];

// unread: conversations with a student message no staff member has opened yet (shown on Messages).
export function AppShell({ staff, unread = 0, children }: { staff: Staff; unread?: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // mobile menu open?
  const links = staff.role === 'teacher' ? TEACHER_NAV : staff.role === 'admin' ? [...NAV, ...ADMIN_NAV] : NAV;

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button className={styles.iconButton} onClick={() => setOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <span className={styles.brand}>PencilMaths</span>
      </header>

      {open && <div className={styles.backdrop} onClick={() => setOpen(false)} />}

      <aside className={`${styles.sidebar} ${open ? styles.open : ''}`}>
        <div className={styles.sidebarHead}>
          <span className={styles.brand}>PencilMaths <small>Admin</small></span>
          <button className={`${styles.iconButton} ${styles.close}`} onClick={() => setOpen(false)} aria-label="Close menu"><XIcon /></button>
        </div>

        <nav className={styles.nav}>
          {links.map(({ href, label, icon: Icon, ready, children }) => {
            const inside = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
            // A parent (Settings) is only highlighted on its own page; on a child page the child is.
            const active = inside && !(children && pathname !== href);
            if (!ready) {
              return (
                <span key={href} className={`${styles.link} ${styles.disabled}`}>
                  <Icon size={18} /> {label} <em>Soon</em>
                </span>
              );
            }
            return (
              <div key={href} className={styles.group}>
                <Link href={href} onClick={() => setOpen(false)}
                  className={`${styles.link} ${active ? styles.active : ''}`} aria-current={active ? 'page' : undefined}>
                  <Icon size={18} /> {label}
                  {href === '/messages' && unread > 0 && (
                    <span className={styles.badge} aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</span>
                  )}
                </Link>
                {children && inside && children.map((c) => {
                  const childActive = pathname === c.href || pathname.startsWith(`${c.href}/`);
                  return (
                    <Link key={c.href} href={c.href} onClick={() => setOpen(false)}
                      className={`${styles.link} ${styles.sublink} ${childActive ? styles.active : ''}`} aria-current={childActive ? 'page' : undefined}>
                      <c.icon size={16} /> {c.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className={styles.user}>
          <div>
            <strong>{staff.full_name}</strong>
            <span>{staff.role.replace('_', ' ')}</span>
          </div>
          <form action={signOut}>
            <button className={styles.iconButton} aria-label="Sign out" title="Sign out"><LogOutIcon size={18} /></button>
          </form>
        </div>
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
