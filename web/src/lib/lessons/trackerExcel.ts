import 'server-only';
import writeXlsxFile, { type Cell, type Row } from 'write-excel-file/node';
import { formatTrackerDate, NOTE_LABEL, standingLabel, standingTone, summaryLine, weekdayList, type LessonTrack, type TrackSummary } from './tracker.ts';

// The Lesson Tracker as an Excel workbook: a Summary sheet, then one sheet per term laid out like the lesson plan
// template (Module · Lesson Code · Lesson · Hw - 1 · Hw - 2 · Hw - 3 · Class No.) with the dates added on the right.
// Planned date and Completed on are real Excel dates, so they sort and filter as dates.

export type ExcelLesson = {
  term: number; module: string; code: string; name: string; class_no: number | null; active: boolean;
  homework: string[];        // Hw - 1, Hw - 2, Hw - 3 codes ('' when none)
  status: string;            // e.g. "Completed"
  completedOn: string | null;
  track: LessonTrack;
};
export type ExcelTracker = { startOn: string; weekdays: number[]; scope: 'whole_year' | 'remaining'; setAt: string; setBy: string | null };

export const DATE_FORMAT = 'dd-mmm-yyyy dddd'; // 16-Nov-2026 Monday, as in the app

const HEADER = ['Module', 'Lesson Code', 'Lesson', 'Hw - 1', 'Hw - 2', 'Hw - 3', 'Class No.', 'Planned date', 'Status', 'Completed on', 'Tracker'];
const WIDTHS = [26, 14, 44, 12, 12, 12, 10, 24, 13, 24, 26];

// "2026-11-16" → a date cell. Midnight UTC, which Excel reads as that day whatever the computer's time zone.
const dateCell = (iso: string): Cell => ({ value: new Date(`${iso}T00:00:00Z`), type: Date, format: DATE_FORMAT });
const bold = (value: string): Cell => ({ value, fontWeight: 'bold' });
// Green for completed early or on time, red for late or overdue (the same colours as the app).
const TONE = { good: { backgroundColor: '#dcfce7', textColor: '#166534' }, bad: { backgroundColor: '#fee2e2', textColor: '#991b1b' } };
const toned = (value: string, track: LessonTrack): Cell => {
  const tone = standingTone(track.standing);
  return tone ? { value, ...TONE[tone] } : value;
};

function trackText(track: LessonTrack, active: boolean): string {
  const label = standingLabel(track.standing);
  if (label) return label;
  return active && track.note && track.note !== 'no_class' ? NOTE_LABEL[track.note] : '';
}

function termSheet(title: string, lessons: ExcelLesson[]): Row[] {
  return [
    [bold(title)],
    HEADER.map(bold),
    ...lessons.map((l): Row => [
      l.module,
      l.code,
      l.active ? l.name : `${l.name} (removed from the plan)`,
      l.homework[0] ?? '', l.homework[1] ?? '', l.homework[2] ?? '',
      l.class_no != null ? `Class ${l.class_no}` : '',
      l.track.plannedOn ? dateCell(l.track.plannedOn) : (l.active && l.track.note ? NOTE_LABEL[l.track.note] : ''),
      l.completedOn ? toned(l.status, l.track) : l.status,
      l.completedOn ? dateCell(l.completedOn) : '',
      toned(trackText(l.track, l.active), l.track),
    ]),
  ];
}

export async function trackerWorkbook({ heading, lessons, tracker, summary, today }: {
  heading: string;           // "TB-1 · Maths · Year 5"
  lessons: ExcelLesson[];
  tracker: ExcelTracker;
  summary: TrackSummary;
  today: string;
}): Promise<Buffer> {
  const row = (label: string, value: Cell): Row => [bold(label), value];
  const summaryRows: Row[] = [
    [bold(`${heading} · Lesson Tracker`)],
    [],
    row('Progress', summaryLine(summary, tracker)),
    row('Plan', tracker.scope === 'remaining' ? 'Classes not yet done' : 'Whole year'),
    row('Start date', dateCell(tracker.startOn)),
    row('Teaching days', weekdayList(tracker.weekdays)),
    row('Classes planned', summary.planned),
    row('First class', summary.first ? dateCell(summary.first) : ''),
    row('Last class', summary.last ? dateCell(summary.last) : ''),
    row("Don't fit before 21 July", summary.unplaced),
    row('Done before the tracker', summary.doneBefore),
    row('Lessons without a Class No.', summary.noClassNo),
    row('Changed since the tracker was set', summary.changed),
    row('Set on', dateCell(tracker.setAt.slice(0, 10))),
    row('Set by', tracker.setBy ?? ''),
    row('Exported on', dateCell(today)),
    [],
    ['Holidays skipped: Christmas (21 Dec–1 Jan) and Easter (Thursday to Sunday). Nothing is planned from 21 July.'],
    [`Planned dates as they stood on ${formatTrackerDate(today)}.`],
  ];

  const terms = [...new Set(lessons.map((l) => l.term))].sort((a, b) => a - b);
  return writeXlsxFile([
    { sheet: 'Summary', data: summaryRows, columns: [{ width: 34 }, { width: 90 }] },
    ...terms.map((term) => ({
      sheet: `Term ${term}`,
      data: termSheet(`${heading} · Term ${term}`, lessons.filter((l) => l.term === term)),
      columns: WIDTHS.map((width) => ({ width })),
      stickyRowsCount: 2,
    })),
  ]).toBuffer();
}
