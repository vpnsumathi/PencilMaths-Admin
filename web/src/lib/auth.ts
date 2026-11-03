import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

// Who is using the portal: staff (any role), or a teacher (sees only their own batches and students).
// A login that is both staff and a teacher gets the staff view. null: not signed in, or neither
// (students and families have their own area at /me).
export type Viewer =
  | { kind: 'staff'; userId: string; fullName: string; role: string }
  | { kind: 'teacher'; userId: string; fullName: string; teacherId: string };

// The signed-in login's id, or null when nobody is signed in.
// getClaims() checks the login token's signature. When the Supabase project uses the newer signing keys
// (Project Settings › JWT Keys) it does this on the server itself, with no call to Supabase; with the older
// shared secret it asks Supabase Auth, like getUser() did. Either way a forged or expired token is refused.
// Never use getSession() for this: it reads the cookie without checking it.
// cache: checked once per page load, however many layouts and components ask.
export const getUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? null;
});

// cache: worked out once per page load, however many components ask.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const userId = await getUserId();
  if (!userId) return null;
  const supabase = await createClient();

  // Both looked up at once. The security rules only return the staff row if the user is active staff;
  // current_teacher returns nothing unless this login is linked to a teacher who hasn't left.
  const [{ data: staff }, { data: teacher }] = await Promise.all([
    supabase.from('staff').select('full_name, role').eq('id', userId).maybeSingle(),
    supabase.rpc('current_teacher'),
  ]);
  if (staff) return { kind: 'staff', userId, fullName: staff.full_name, role: staff.role };
  if (teacher) {
    return { kind: 'teacher', userId, fullName: `${teacher.first_name} ${teacher.last_name}`, teacherId: teacher.id };
  }
  return null;
});

export const isTeacher = async () => (await getViewer())?.kind === 'teacher';

// For admin-only pages and actions. Returns the Supabase connection and the viewer,
// or sends anyone who is not an admin to `redirectTo` (and anyone signed out to the login page).
// Uses the same cached check as the portal layout, so a page doesn't check the login twice.
export async function requireAdmin(redirectTo = '/') {
  const viewer = await getViewer();
  if (!viewer) redirect((await getUserId()) ? redirectTo : '/login');
  if (viewer.kind !== 'staff' || viewer.role !== 'admin') redirect(redirectTo);
  return { supabase: await createClient(), viewer };
}

// For pages and actions that are for staff only, never teachers (students, enquiries, editing batches…).
// The database rules block teachers too; this stops them earlier with a friendly page.
export async function requireStaff(redirectTo = '/') {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  if (viewer.kind !== 'staff') redirect(redirectTo);
  return viewer;
}
