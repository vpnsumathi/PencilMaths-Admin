'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { signOut } from '@/app/actions';
import { ChevronDownIcon, ClipboardListIcon, LockIcon, LogOutIcon } from '@/components/icons';
import m from './phone.module.css';
import { StudentSwitcher, type LinkedStudent } from './StudentSwitcher';

// Phones only: the round button at the top right with the student's first name. It opens a small menu with
// Switch child (family logins), Lesson plan, Change password and Sign out. A plain <details>, so it opens
// even before the page's JavaScript has loaded; the script only closes it after a tap elsewhere or a page change.
export function AccountMenu({ firstName, name, students }: { firstName: string; name: string; students: LinkedStudent[] }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  // Close after moving to another page (the top bar stays on screen between pages).
  useEffect(() => { if (menu.current) menu.current.open = false; }, [pathname]);

  // Close on a tap outside the menu, or on Escape.
  useEffect(() => {
    const close = (e: Event) => {
      const el = menu.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, []);

  return (
    <details ref={menu} className={m.menu}>
      <summary className={m.account} aria-label={`Account menu: ${name}`}>
        <span className={m.avatar} aria-hidden="true">{firstName.charAt(0).toUpperCase()}</span>
        <span className={m.accountName}>{firstName}</span>
        <ChevronDownIcon size={16} />
      </summary>
      <div className={m.panel}>
        <p className={m.signedIn}>{students.length > 1 ? 'Showing' : 'Signed in as'}<strong>{name}</strong></p>
        {students.length > 1 && (
          <div className={m.switch}>
            <span className={m.switchLabel}>Switch child</span>
            <StudentSwitcher students={students} />
          </div>
        )}
        <div className={m.menuItems}>
          <Link href="/me/lesson-plan" className={m.menuItem}><ClipboardListIcon /> Lesson plan</Link>
          <Link href="/me/password" className={m.menuItem}><LockIcon /> Change password</Link>
          <form action={signOut}>
            <button className={m.menuItem}><LogOutIcon /> Sign out</button>
          </form>
        </div>
      </div>
    </details>
  );
}
