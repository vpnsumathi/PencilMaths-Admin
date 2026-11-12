import 'server-only';
import { siteUrl } from '@/lib/siteUrl';
import { createAdminClient, findUserByEmail } from '@/lib/supabase/admin';

// The Supabase Auth side of giving someone a login, shared by student logins (students/actions.ts) and teacher
// logins (teachers/actions.ts). Each action still does its own checks first and links the login to its own
// record. These use the full-rights connection, so only call them after the action has checked the caller
// (requireStaff / requireAdmin). They throw when Supabase fails; the action turns that into a message.

// Invites land on /auth/accept, where the person chooses a password.
const acceptUrl = async () => `${await siteUrl()}/auth/accept`;

// Sends an invite email to `email`. If the email already has a login (staff, a teacher, or a family login used
// for a brother or sister), that login is returned instead: existing = true, and no email is sent.
// `meta` is stored on a new login and used by the invite email template (role, full_name).
export async function inviteOrFindLogin(email: string, meta: Record<string, string>) {
  const { data, error } = await createAdminClient().auth.admin.inviteUserByEmail(email, {
    data: meta,
    redirectTo: await acceptUrl(),
  });
  if (!error) return { id: data.user.id, existing: false };
  if (!/already|registered|exists/i.test(error.message)) throw new Error(error.message);
  const found = await findUserByEmail(email);
  if (!found) throw new Error(error.message);
  return { id: found, existing: true };
}

// Sends the invite email again. 'accepted' if the person has already signed in (nothing is sent then).
export async function resendInvite(loginId: string): Promise<'sent' | 'accepted'> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(loginId);
  if (!data.user?.email) throw new Error('login not found');
  if (data.user.last_sign_in_at) return 'accepted';
  const { error } = await admin.auth.admin.inviteUserByEmail(data.user.email, { redirectTo: await acceptUrl() });
  if (error) throw new Error(error.message);
  return 'sent';
}

// Deletes a login, so it can no longer sign in.
export async function deleteLogin(loginId: string) {
  const { error } = await createAdminClient().auth.admin.deleteUser(loginId);
  if (error) throw new Error(error.message);
}

// After a failed link: deletes a login that was only just created by inviteOrFindLogin, so it isn't left
// linked to nobody. Best effort: a failure is logged and the action's own error message still shows.
export async function discardNewLogin(loginId: string) {
  await deleteLogin(loginId).catch((e) => console.error('discardNewLogin failed (a spare login is left in Supabase Auth):', e));
}
