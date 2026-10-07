'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { signOut } from '@/app/actions';
import styles from './AppShell.module.css';
import {
  CalendarIcon, HomeIcon, LogOutIcon, MailIcon, MenuIcon, PencilIcon, ShieldCheckIcon, UsersIcon, XIcon,
} from './icons';

type Staff = { full_name: string; role: string };

// Sidebar links. ready: false shows the link greyed out until that screen is built.
const NAV = [
  { href: '/', label: 'Dashboard', icon: HomeIcon, ready: true },
  { href: '/students', label: 'Students', icon: UsersIcon, ready: false },
  { href: '/teachers', label: 'Teachers', icon: PencilIcon, ready: false },
  { href: '/batches', label: 'Batches', icon: CalendarIcon, ready: false },
  { href: '/enquiries', label: 'Enquiries', icon: MailIcon, ready: false },
];
const ADMIN_NAV = [{ href: '/staff', label: 'Staff', icon: ShieldCheckIcon, ready: true }];

export function AppShell({ staff, children }: { staff: Staff; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // mobile menu open?
  const links = staff.role === 'admin' ? [...NAV, ...ADMIN_NAV] : NAV;

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button className={styles.iconButton} onClick={() => setOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <span className={styles.brand}>Pencil Maths</span>
      </header>

      {open && <div className={styles.backdrop} onClick={() => setOpen(false)} />}

      <aside className={`${styles.sidebar} ${open ? styles.open : ''}`}>
        <div className={styles.sidebarHead}>
          <span className={styles.brand}>Pencil Maths <small>Admin</small></span>
          <button className={`${styles.iconButton} ${styles.close}`} onClick={() => setOpen(false)} aria-label="Close menu"><XIcon /></button>
        </div>

        <nav className={styles.nav}>
          {links.map(({ href, label, icon: Icon, ready }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return ready ? (
              <Link key={href} href={href} onClick={() => setOpen(false)}
                className={`${styles.link} ${active ? styles.active : ''}`} aria-current={active ? 'page' : undefined}>
                <Icon size={18} /> {label}
              </Link>
            ) : (
              <span key={href} className={`${styles.link} ${styles.disabled}`}>
                <Icon size={18} /> {label} <em>Soon</em>
              </span>
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