import { ConfirmButton } from '@/components/ConfirmButton';
import ui from '@/components/ui.module.css';
import { cleanClassLink } from '@/lib/classLink';
import { isPending, refreshClassroom, type ClassroomRow } from '@/lib/classroomSetup';
import { formatDay, formatClock } from '@/lib/format';
import styles from './attendance.module.css';
import { ClassroomButton } from './ClassroomButton';
import { disconnectClassroomAction, resendClassroomInvite, setUpClassroom } from './classroomActions';

type Props = {
  row: ClassroomRow;
  teacher: boolean;                                  // the viewer is the batch's teacher
  batchTeacher: { id: string; name: string } | null; // for staff: the batch's teacher now
};

// The section header's one line for a class the app created.
export function classroomSummary(r: ClassroomRow) {
  if (!r.course_id) return 'Setup not finished';
  if (r.course_state === 'PROVISIONED') return 'Created · waiting to be accepted';
  if (r.course_state !== 'ACTIVE') return `Class ${r.course_state?.toLowerCase() ?? 'not active'}`;
  return { joined: 'Active · teacher joined', invited: 'Active · teacher invited', gone: 'Active · teacher not in the class', none: 'Active · teacher not invited yet' }[r.teacher_status];
}

// Asks Google for news first (if something is waiting), then shows the steps. Used inside <Suspense>, with
// ClassroomSteps showing what was saved before while Google answers.
export async function FreshClassroomStatus(props: Props) {
  return <ClassroomSteps {...props} row={await refreshClassroom(props.row)} />;
}

// The steps of a class the app created, what is still to do, and the buttons.
export function ClassroomSteps({ row, teacher, batchTeacher }: Props) {
  const link = cleanClassLink(row.teacher_link);
  const active = row.course_state === 'ACTIVE';
  const teacherChanged = !teacher && batchTeacher && row.teacher_id && row.teacher_id !== batchTeacher.id;
  const invitedName = !teacher && batchTeacher && row.teacher_id === batchTeacher.id ? batchTeacher.name : 'The teacher';

  // What a teacher sees: their Join class once Google says they joined.
  if (teacher) {
    return (
      <>
        {active && row.teacher_status === 'joined' && link ? (
          <p className={styles.linkRow} style={{ margin: '0 0 8px' }}>
            <a href={link} target="_blank" rel="noopener noreferrer" className={ui.primaryButton}>Join class</a>
            {row.enrollment_code && <span className={ui.muted}>Class code {row.enrollment_code}</span>}
          </p>
        ) : (
          <p className={ui.empty} style={{ margin: 0 }}>
            {!active ? 'The office is still setting up this class in Google Classroom.'
              : row.teacher_status === 'invited' ? `Google Classroom has emailed you an invitation${row.teacher_email ? ` (to ${row.teacher_email})` : ''}. Accept it, and Join class appears here.`
              : 'You are not a teacher of this Google Classroom class yet. Ask the office to invite you.'}
          </p>
        )}
      </>
    );
  }

  const step = (doneNow: boolean, text: React.ReactNode, warn = false) => (
    <li className={doneNow ? styles.stepDone : warn ? styles.stepWarn : styles.stepTodo}>
      <span aria-hidden="true">{doneNow ? '✓' : warn ? '!' : '○'}</span><span>{text}</span>
    </li>
  );

  return (
    <>
      {row.last_error && <p className={`${ui.alert} ${ui.alertError}`}>{row.last_error}</p>}
      <ol className={styles.steps}>
        {step(Boolean(row.course_id), row.course_id
          ? <>Class created in Google Classroom{link && <> · <a href={link} target="_blank" rel="noopener noreferrer" className={ui.link}>Open it</a></>}</>
          : 'Creating the class in Google Classroom stopped before it finished. Press Finish setup.')}
        {row.course_id && step(active, active
          ? 'Active: students in this batch see Join class in their login'
          : row.course_state === 'PROVISIONED'
            ? <>Waiting to be accepted. Open <a href={link ?? 'https://classroom.google.com/'} target="_blank" rel="noopener noreferrer" className={ui.link}>Google Classroom</a> with the Pencil Maths Google account, press <b>Accept</b> on the class, then press Check now.</>
            : `The class is ${row.course_state?.toLowerCase() ?? 'not active'} in Google Classroom, so students don't see Join class.`,
          row.course_state !== 'PROVISIONED' && !active)}
        {active && step(row.teacher_status === 'joined', {
          joined: `${invitedName} has joined the class${row.teacher_email ? ` (${row.teacher_email})` : ''}.`,
          invited: `${invitedName} was invited${row.teacher_email ? ` (${row.teacher_email})` : ''}${row.invited_at ? ` on ${formatDay(row.invited_at)}` : ''}: waiting for them to accept Google's email. Their Join class appears here once they do.`,
          gone: `${invitedName}'s invitation is no longer there: they declined it, or were removed from the class. Press Resend invite.`,
          none: 'The teacher hasn\'t been invited yet. Press Finish setup (the batch needs a teacher with a Google account email).',
        }[row.teacher_status], row.teacher_status === 'gone')}
      </ol>
      {teacherChanged && (
        <p className={`${ui.alert} ${ui.alertError}`}>
          The batch&apos;s teacher is now {batchTeacher.name}. Press Finish setup to invite them. Whoever was invited before stays in
          the Google class until you remove them there.
        </p>
      )}
      {active && row.enrollment_code && (
        <p className={ui.hint} style={{ margin: '0 0 12px' }}>
          Class code <b>{row.enrollment_code}</b>. Students&apos; Join class includes it, so a new student is asked once to join the
          class with their Google account; after that it opens the class.
        </p>
      )}
      <div className={ui.formActions}>
        <form action={setUpClassroom}>
          <input type="hidden" name="id" value={row.batch_id} />
          <ClassroomButton label={row.last_error || !row.course_id || teacherChanged || (active && row.teacher_status === 'none') ? 'Finish setup' : 'Check now'}
            busy="Asking Google…" className={isPending(row) || row.last_error || teacherChanged ? ui.primaryButton : ui.button} />
        </form>
        {active && row.teacher_status === 'gone' && (
          <form action={resendClassroomInvite}>
            <input type="hidden" name="id" value={row.batch_id} />
            <ClassroomButton label="Resend invite" busy="Inviting…" className={ui.button} />
          </form>
        )}
        <form action={disconnectClassroomAction}>
          <input type="hidden" name="id" value={row.batch_id} />
          <ConfirmButton className={ui.dangerButton}
            message="Disconnect this batch from its Google Classroom class? Students lose Join class. The class itself stays in Google Classroom.">
            Disconnect
          </ConfirmButton>
        </form>
        {row.checked_at && <span className={ui.stamp}>Checked with Google {formatDay(row.checked_at)} {formatClock(row.checked_at)}</span>}
      </div>
    </>
  );
}
