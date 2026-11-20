'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookIcon, CalendarIcon, ClipboardCheckIcon, HomeIcon, MessageIcon } from '@/components/icons';
import m from './phone.module.css';

// The tab bar along the bottom of the screen on phones (hidden on bigger screens, which keep the top tabs).
// Five tabs at most, so each one is big enough for a thumb. Lesson plan is in the account menu and on each class card.
const TABS = [
  { href: '/me', label: 'Home', Icon: HomeIcon },
  { href: '/me/classes', label: 'Classes', Icon: CalendarIcon },
  { href: '/me/homework', label: 'Homework', Icon: ClipboardCheckIcon },
  { href: '/me/notes', label: 'Notes', Icon: BookIcon },
  { href: '/me/messages', label: 'Messages', Icon: MessageIcon },
] as const;

// unread: messages from PencilMaths not seen yet, shown on the Messages tab (not while that page is open).
export function BottomNav({ unread = 0 }: { unread?: number }) {
  const pathname = usePathname();
  return (
    <nav className={m.bottom} aria-label="Student menu">
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href;
        const count = href === '/me/messages' && !active ? unread : 0;
        return (
          <Link key={href} href={href} className={`${m.bottomTab} ${active ? m.bottomTabOn : ''}`}
            aria-current={active ? 'page' : undefined} aria-label={count > 0 ? `${label}, ${count} new` : undefined}>
            <Icon size={24} />
            {label}
            {count > 0 && <span className={m.bottomBadge} aria-hidden="true">{count > 99 ? '99+' : count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
