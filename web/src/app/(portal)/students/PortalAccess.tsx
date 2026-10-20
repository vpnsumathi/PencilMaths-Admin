import ui from '@/components/ui.module.css';
import { createAdminClient } from '@/lib/supabase/admin';
import { givePortalAccess, removePortalAccess, resendPortalInvite } from './actions';

type Login = { email: string; accepted: boolean } | null | 'unknown';

// What Supabase knows about the student's login: its email, and whether the invite was accepted.
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

// Student page card: give, resend or remove the student's own login.
export async function PortalAccess({ studentId, authUserId, suggestedEmail }: {
  studentId: string; authUserId: string | null; suggestedEmail: string | null;
}) {
  const login = await loadLogin(authUserId);

  return (
    <section className={ui.card} style={{ marginBottom: 16, maxWidth: 900 }}>
      <h2>Student login</h2>
      {login === null ? (
        <form action={givePortalAccess}>
          <p className={ui.hint}>
            The student signs in to see their classes and homework, and can hand in homework. Use an email the family checks.
          </p>
          <input type="hidden" name="id" value={studentId} />
          <div className={ui.formActions}>
            <input name="email" type="email" required defaultValue={suggestedEmail ?? ''} className={ui.input}
              placeholder="Email for the login" aria-label="Email for the student login" style={{ minWidth: 260 }} />
            <button className={ui.primaryButton}>Give portal access</button>
          </div>
        </form>
      ) : (
        <>
          <p style={{ margin: '0 0 12px' }}>
            {login === 'unknown'
              ? 'This student has a login, but its details could not be loaded.'
              : login.accepted
                ? `Can sign in as ${login.email}.`
                : `Invite sent to ${login.email}. Waiting for the student to accept it.`}
          </p>
          <div className={ui.formActions}>
            {login !== 'unknown' && !login.accepted && (
              <form action={resendPortalInvite}>
                <input type="hidden" name="id" value={studentId} />
                <button className={ui.button}>Resend invite</button>
              </form>
            )}
            <form action={removePortalAccess}>
              <input type="hidden" name="id" value={studentId} />
              <button className={ui.dangerButton}>Remove access</button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
