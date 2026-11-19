import Link from 'next/link';
import styles from './TermTabs.module.css';

// One tab per term, each a plain link (?term=2), so the page stays server-rendered and a tab can be bookmarked.
// The count is lessons completed out of lessons in that term.
export function TermTabs({ terms, current, href }: {
  terms: { term: number; done: number; total: number }[];
  current: number;
  href: (term: number) => string;
}) {
  if (terms.length < 2) return null;
  return (
    <nav className={styles.tabs} aria-label="Terms">
      {terms.map(({ term, done, total }) => (
        <Link key={term} href={href(term)} className={`${styles.tab} ${term === current ? styles.active : ''}`}
          aria-current={term === current ? 'page' : undefined}>
          Term {term}<span className={styles.count} title={`${done} of ${total} lessons completed`}>{done}/{total}</span>
        </Link>
      ))}
    </nav>
  );
}
