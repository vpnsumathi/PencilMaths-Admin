import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

// Who is using the portal: staff (any role), or a teacher (sees only their own batches and students).
// A login that is both staff and a teacher gets the staff view. null: not signed in, or neither
// (students and families have their own area at /me).
export type Viewer =
  | { kind: 'staff'; userId: string; fullName: string; role: string }
  | { kind: 'teacher'; userId: string; fullName: string; teacherId: string };

// cache: worked out once per page load, however many components ask.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // The security rules only return this row if the user is active staff.
  const { data: staff } = await supabase.from('staff').select('full_name, role').eq('id', user.id).maybeSingle();
  if (staff) return { kind: 'staff', userId: user.id, fullName: staff.full_name, role: staff.role };

  // Returns nothing unless this login is linked to a teacher who hasn't left.
  const { data: teacher } = await supabase.rpc('current_teacher');
  if (teacher) {
    return { kind: 'teacher', userId: user.id, fullName: `${teacher.first_name} ${teacher.last_name}`, teacherId: teacher.id };
  }
  return null;
});

export const isTeacher = async () => (await getViewer())?.kind === 'teacher';

// For admin-only pages and actions. Returns the Supabase connection and user,
// or sends anyone who is not an admin to `redirectTo`.
export async function requireAdmin(redirectTo = '/') {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('staff').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'admin') redirect(redirectTo);

  return { supabase, user };
}

// For pages and actions that are for staff only, never teachers (students, enquiries, editing batches…).
// The database rules block teachers too; this stops them earlier with a friendly page.
export async function requireStaff(redirectTo = '/') {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  if (viewer.kind !== 'staff') redirect(redirectTo);
  return viewer;
}
