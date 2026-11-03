import { formatDay } from '@/lib/format';
import ui from './ui.module.css';

// The "Created / modified" cell on the lists: the date a record was added and, under it, the date it was
// last changed (only once it has been changed). Both are UK dates.
export function CreatedModified({ created, updated }: { created: string | null; updated: string | null }) {
  const changed = !!updated && (!created || Date.parse(updated) > Date.parse(created));
  return (
    <>
      <div>{formatDay(created)}</div>
      {changed && <div className={ui.stamp}>Modified {formatDay(updated)}</div>}
    </>
  );
}
