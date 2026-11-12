import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { attendanceLine, markLabel, markTone, type AttendanceTotals } from '@/lib/classLink';
import { formatDate } from '@/lib/format';

// A student's attendance over the last 12 weeks, with their latest classes. The numbers come from the database
// (attendance_totals), the same ones the family sees in the student login. Shows nothing until the database
// script for it (20261111000001_class_link_attendance.sql) has been run.
export function AttendanceCard({ totals, note }: { totals: AttendanceTotals | null; note?: string }) {
  if (!totals) return null;
  return (
    <section className={ui.card} style={{ marginBottom: 16, maxWidth: 900 }}>
      <h2>Attendance</h2>
      <p style={{ margin: '0 0 8px' }}>
        <strong>{attendanceLine(totals)}</strong>
        <span className={ui.muted}> · last 12 weeks{note ? `, ${note}` : ''}</span>
      </p>
      {totals.recent.length > 0 && (
        <ul className={ui.list}>
          {totals.recent.map((r) => (
            <li key={r.class_date}>
              <span>{formatDate(r.class_date)}</span>
              <StatusBadge status={markTone(r.status, r.source)} label={markLabel(r.status, r.source)} />
            </li>
          ))}
        </ul>
      )}
      <p className={ui.hint}>To correct a class, open the batch and use its Attendance register.</p>
    </section>
  );
}
