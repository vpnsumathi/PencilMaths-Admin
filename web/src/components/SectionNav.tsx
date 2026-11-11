'use client';

import s from './SectionNav.module.css';

export type SectionLink = {
  id: string; label: string;
  // Scroll to this element inside the section once it is open (e.g. the latest homework).
  target?: string;
  // Stands out (e.g. Homework on the batch page).
  highlight?: boolean;
};

const smooth = () => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

// The bar of section names under a page's title (stays at the top while scrolling). Pressing a name opens that
// section and moves to it. Expand all / Collapse all open or close every section on the page at once.
export function SectionNav({ links }: { links: SectionLink[] }) {
  function go(e: React.MouseEvent<HTMLAnchorElement>, link: SectionLink) {
    const section = document.getElementById(link.id);
    if (!(section instanceof HTMLDetailsElement)) return; // let the browser follow the link
    e.preventDefault();
    section.open = true;
    const to = (link.target && document.getElementById(link.target)) || section;
    to.scrollIntoView({ behavior: smooth(), block: 'start' });
    window.history.replaceState(null, '', `#${link.id}`);
  }
  function all(open: boolean) {
    document.querySelectorAll<HTMLDetailsElement>('details[data-section]').forEach((d) => { d.open = open; });
  }

  return (
    <nav className={s.bar} aria-label="Sections on this page">
      <ul className={s.links}>
        {links.map((l) => (
          <li key={l.id}>
            <a href={`#${l.id}`} onClick={(e) => go(e, l)} className={`${s.chip} ${l.highlight ? s.highlight : ''}`}>{l.label}</a>
          </li>
        ))}
      </ul>
      <span className={s.tools}>
        <button type="button" className={s.tool} onClick={() => all(true)}>Expand all</button>
        <button type="button" className={s.tool} onClick={() => all(false)}>Collapse all</button>
      </span>
    </nav>
  );
}
