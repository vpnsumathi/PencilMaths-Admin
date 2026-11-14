import Link from 'next/link';
import { ConfirmButton } from '@/components/ConfirmButton';
import ui from '@/components/ui.module.css';
import type { MeetRoom } from '@/lib/meetRoom';
import styles from './attendance.module.css';
import { ClassroomButton } from './ClassroomButton';
import { createMeetRoomAction, recreateMeetRoomAction } from './meetActions';

// Staff only, inside the Google Classroom section: the batch's Google Meet room (guide 21, section 12).
export function MeetRoomBlock({ batchId, room }: { batchId: string; room: MeetRoom | null }) {
  return (
    <div className={styles.meetBox}>
      <h3>Meet room</h3>
      {room ? (
        <>
          <p>
            Made by the app, so the <Link href="/class-schedule" className={ui.link}>Class Schedule</Link> page can show who is in
            the call. At class time, Join class opens this room for students and the teacher; at other times it opens Google
            Classroom. <a href={`/batches/${batchId}/meet`} target="_blank" rel="noopener noreferrer" className={ui.link}>Open the room</a>
          </p>
          <form action={recreateMeetRoomAction}>
            <input type="hidden" name="id" value={batchId} />
            <ConfirmButton className={ui.button}
              message="Make a new Meet room for this batch? The old room's link stops being used. Use this if the room no longer works.">
              Recreate room
            </ConfirmButton>
          </form>
        </>
      ) : (
        <>
          <p>
            Make a Google Meet room for this batch with the app&apos;s Google account. At class time Join class opens it, and the
            Class Schedule page shows who is in the call.
          </p>
          <form action={createMeetRoomAction}>
            <input type="hidden" name="id" value={batchId} />
            <ClassroomButton label="Create Meet room" busy="Making the room…" className={ui.primaryButton} />
          </form>
        </>
      )}
    </div>
  );
}
