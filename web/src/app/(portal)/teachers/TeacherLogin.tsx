import ui from '@/components/ui.module.css';
import { createAdminClient } from '@/lib/supabase/admin';
import { giveTeacherLogin, removeTeacherLogin, resendTeacherInvite } from './actions';

type Login = { email: string; accepted: boolean } | null | 'unknown';

// What Supabase knows about the teacher's login: its email, and whether the invite was accepted.
async function loadLogin(authUserId: string | null): Promise<Login> {
  if (!authUserId) return null;
  try {
    const { data } = await createAdminClient().auth.admin.getUserById(authUserId);
    return data.user?.email ? { email: data.user.email, accepted: Boolean(data.user.last_sign_in_at) } : 'unknown';
  } catch (e) {
    console.error('loadLogin failed:', e);
    return 'unknown';
  }
}

// Teacher page card (admins only): send, resend or remove the teacher's own login.
export async function TeacherLogin({ teacherId, authUserId, suggestedEmail, left }: {
  teacherId: string; authUserId: string | null; suggestedEmail: string | null; left: boolean;
}) {
  const login = await loadLogin(authUserId);

  return (
    <section className={ui.card} style={{ marginBottom: 16, maxWidth: 900 }}>
      <h2>Teacher login</h2>
      {login === null ? (
        left ? (
          <p className={ui.hint} style={{ margin: 0 }}>This teacher has left, so they cannot have a login.</p>
        ) : (
          <form action={giveTeacherLogin}>
            <p className={ui.hint}>
              The teacher signs in to see their own batches and the students in them: lesson plan, homework, hand-ins
              and marking. They don&apos;t see parents&apos; details, enquiries, other teachers or other batches.
            </p>
            <input type="hidden" name="id" value={teacherId} />
            <div className={ui.formActions}>
              <input name="email" type="email" required defaultValue={suggestedEmail ?? ''} className={ui.input}
                placeholder="Email for the login" aria-label="Email for the teacher login" style={{ minWidth: 260 }} />
              <button className={ui.primaryButton}>Send login invite</button>
            </div>
          </form>
        )
      ) : (
        <>
          <p style={{ margin: '0 0 12px' }}>
            {login === 'unknown'
              ? 'This teacher has a login, but its details could not be loaded.'
              : login.accepted
                ? `Can sign in as ${login.email}.`
                : `Invite sent to ${login.email}. Waiting for the teacher to accept it.`}
            {left && ' They are marked as Left, so they see nothing when they sign in.'}
          </p>
          <div className={ui.formActions}>
            {login !== 'unknown' && !login.accepted && (
              <form action={resendTeacherInvite}>
                <input type="hidden" name="id" value={teacherId} />
                <button className={ui.button}>Resend invite</button>
              </form>
            )}
            <form action={removeTeacherLogin}>
              <input type="hidden" name="id" value={teacherId} />
              <button className={ui.dangerButton}>Remove access</button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
