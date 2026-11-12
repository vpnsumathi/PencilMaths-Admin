import ui from '@/components/ui.module.css';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
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
  // Family login: brothers and sisters opened by the same login.
  const { data: siblings } = authUserId
    ? await (await createClient()).from('students').select('id, first_name, last_name')
      .eq('auth_user_id', authUserId).neq('id', studentId).order('first_name')
    : { data: [] };

  return (
    <section className={ui.card} style={{ marginBottom: 16, maxWidth: 900 }}>
      <h2>Student login</h2>
      {login === null ? (
        <form action={givePortalAccess}>
          <p className={ui.hint}>
            The student signs in to see their classes and homework, and can hand in homework. Use an email the family checks.
            For brothers and sisters, use the same email: one login opens all of them.
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
            {siblings && siblings.length > 0 && (
              <> Shared with{' '}
                {siblings.map((x, i) => (
                  <span key={x.id}>{i > 0 && ', '}<a href={`/students/${x.id}`} className={ui.link}>{x.first_name} {x.last_name}</a></span>
                ))}
                : one login, switching child from the top bar.</>
            )}
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
