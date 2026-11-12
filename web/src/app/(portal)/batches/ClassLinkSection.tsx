import { ConfirmButton } from '@/components/ConfirmButton';
import { Section } from '@/components/Section';
import ui from '@/components/ui.module.css';
import { CLASS_LINK_HELP } from '@/lib/classLink';
import { formatDay } from '@/lib/format';
import styles from './attendance.module.css';
import { saveClassLink } from './classActions';

export type ClassLink = {
  class_link: string | null;
  class_link_updated_at: string | null;
  changed_by: { full_name: string } | null;
};

type Props = {
  batchId: string;
  // null: the database script for this hasn't been run yet (only staff are told).
  info: ClassLink | null;
  teacher: boolean;
  closed: boolean;
};

// The batch's Google Classroom link. Staff paste, replace or remove it; the batch's teacher sees it and joins
// with it. Students never see the link itself: they press Join class in their login (see /me/classes).
export function ClassLinkSection({ batchId, info, teacher, closed }: Props) {
  const link = info?.class_link ?? null;

  return (
    <Section id="google-classroom" title="Google Classroom"
      summary={!info && !teacher ? 'Not available yet' : link ? 'Class link added' : 'No class link yet'}>

      {!info && !teacher && (
        <p className={ui.empty}>The database is not ready for this yet: run 20261111000001_class_link_attendance.sql in Supabase first.</p>
      )}

      {link ? (
        <p className={styles.linkRow} style={{ margin: '0 0 12px' }}>
          <a href={link} target="_blank" rel="noopener noreferrer" className={ui.primaryButton}>Join class</a>
          <span className={`${ui.muted} ${styles.linkText}`}>{link}</span>
        </p>
      ) : (
        (info || teacher) && (
          <p className={ui.empty} style={{ margin: '0 0 12px' }}>
            {teacher ? 'No class link yet. Ask the office to add it.' : 'No class link yet.'}
          </p>
        )
      )}

      {info && !teacher && (
        <>
          <form action={saveClassLink}>
            <input type="hidden" name="id" value={batchId} />
            <label className={ui.label} htmlFor="class_link">{link ? 'Replace the link' : 'Paste the class link'}</label>
            <div className={styles.linkRow} style={{ marginTop: 6 }}>
              <input id="class_link" name="class_link" type="url" required maxLength={500} defaultValue={link ?? ''}
                placeholder="https://classroom.google.com/c/…" className={ui.input} />
              <button className={ui.primaryButton}>Save link</button>
            </div>
          </form>
          <p className={ui.hint} style={{ margin: '8px 0 0' }}>
            {CLASS_LINK_HELP} Students in this batch get a <strong>Join class</strong> button in their login, and the
            teacher gets one here. {closed ? 'This batch is closed, so students don\'t see the button.' : 'A student who presses it at class time is marked present.'}
          </p>
          {link && (
            <form action={saveClassLink} className={ui.formActions} style={{ marginTop: 12 }}>
              <input type="hidden" name="id" value={batchId} />
              <input type="hidden" name="remove" value="true" />
              <ConfirmButton message="Remove the class link? Students and the teacher will no longer see Join class." className={ui.dangerButton}>
                Remove link
              </ConfirmButton>
              {info.class_link_updated_at && (
                <span className={ui.stamp}>
                  Last changed {formatDay(info.class_link_updated_at)}{info.changed_by ? ` by ${info.changed_by.full_name}` : ''}
                </span>
              )}
            </form>
          )}
        </>
      )}
    </Section>
  );
}
