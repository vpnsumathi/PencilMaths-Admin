// Deleting from the Lesson library (guide 14, section 13): the shapes the database sends back
// (20261125000001_lesson_library_delete.sql) and the plain-English lines the pages and messages show.
// Kept apart from the pages so it can be tested on its own (library.test.ts, npm test).

export type UsedBatch = { batch_id: string; code: string };
export type LessonUsage = {
  lesson_id: string;
  progress: (UsedBatch & { status: 'in_progress' | 'complete'; closed: boolean })[];
  homework: { homework_id: string; code: string; slot: number; has_file: boolean; sent: UsedBatch[]; question_bank: number }[];
  notes: { batch_id: string | null; code: string | null; notes: number }[];
  trackers: UsedBatch[];
  used: boolean;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (codes: string[]) => codes.join(', ');

// Why a lesson can't be deleted, one line per reason, e.g. "Completed in TB-1".
export function usageReasons(u: LessonUsage): string[] {
  const out: string[] = [];
  const completed = u.progress.filter((p) => p.status === 'complete').map((p) => p.code);
  const started = u.progress.filter((p) => p.status !== 'complete').map((p) => p.code);
  if (completed.length) out.push(`Completed in ${list(completed)}`);
  if (started.length) out.push(`In progress in ${list(started)}`);
  for (const h of u.homework) {
    if (h.sent.length) out.push(`Hw-${h.slot} ${h.code} sent to ${list(h.sent.map((b) => b.code))}`);
    if (h.question_bank > 0) out.push(`Question bank work on ${h.code}`);
  }
  for (const n of u.notes) {
    out.push(n.code ? `${plural(n.notes, 'class note')} in ${n.code} about it` : `${plural(n.notes, 'personal note')} about it`);
  }
  if (u.trackers.length) out.push(`In the Lesson Tracker dates of ${list(u.trackers.map((t) => t.code))}`);
  return out;
}

// Every class that uses any of these lessons, by code, once each, in order.
export function usedByClasses(usages: LessonUsage[]): string[] {
  const codes = new Set<string>();
  for (const u of usages) {
    if (!u.used) continue;
    for (const b of [...u.progress, ...u.trackers, ...u.homework.flatMap((h) => h.sent)]) codes.add(b.code);
    for (const n of u.notes) if (n.code) codes.add(n.code);
  }
  return [...codes].sort();
}

// What happened to the worksheet files offered for the Drive bin, for the end of a message ("" when none).
export function binNote(r: { binned: number; left: number } | null) {
  if (!r) return '';
  const parts: string[] = [];
  if (r.binned) parts.push(`${plural(r.binned, 'worksheet file')} moved to the Google Drive bin.`);
  if (r.left) {
    parts.push(`${plural(r.left, 'worksheet file')} couldn't be moved to the bin and ${r.left === 1 ? 'is' : 'are'} still in ` +
      'Google Drive › PencilMaths › Homework library (already gone, or made under another Google connection).');
  }
  return parts.join(' ');
}

// The import's note on homework codes it removed or kept ("" when none).
export function importCodesNote(dropped: number, kept: string[]) {
  const parts: string[] = [];
  if (dropped) parts.push(`${plural(dropped, 'homework code')} with an empty cell ${dropped === 1 ? 'was' : 'were'} removed.`);
  if (kept.length) {
    const shown = kept.slice(0, 3).join('; ');
    parts.push(`Kept because already sent: ${shown}${kept.length > 3 ? ` and ${kept.length - 3} more` : ''}.`);
  }
  return parts.join(' ');
}
