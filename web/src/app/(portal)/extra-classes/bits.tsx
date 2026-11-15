import { resultText, resultTone, STATUS_LABEL, type ExtraStatus } from '@/lib/extraClasses';
import styles from './extra.module.css';

// Small pieces shared by the Extra classes pages, the student page card and the dashboards.

// A class's status in words (the colour is only a second clue).
export function ExtraStatusPill({ status }: { status: ExtraStatus }) {
  return <span className={`${styles.status} ${styles[`s_${status}`]}`}>{STATUS_LABEL[status]}</span>;
}

// The purple "Extra" label that sets an extra class apart from weekly batch classes.
export function ExtraBadge() {
  return <span className={styles.extraBadge}>Extra</span>;
}

// One student's result on a class: Present, Late, Absent, Checked in, Not marked or Cancelled.
export function Result({ mark, source, cancelled }: { mark: Parameters<typeof resultText>[0]; source: Parameters<typeof resultText>[1]; cancelled?: boolean }) {
  return <span className={`${styles.result} ${styles[`r${resultTone(mark, source, cancelled)}`]}`}>{resultText(mark, source, cancelled)}</span>;
}
