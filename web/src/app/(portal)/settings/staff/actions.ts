'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';

const ROLES = ['admin', 'operations', 'head_teacher'];

// Shared start for every staff change: must be an admin (the database rules also insist on it), and not
// changing their own account.
async function connectFor(targetId: string) {
  const { supabase, viewer } = await requireAdmin();
  if (targetId === viewer.userId) redirect('/settings/staff?error=You cannot change your own account.');
  return supabase;
}

export async function updateRole(form: FormData) {
  const id = String(form.get('id'));
  const role = String(form.get('role'));
  if (!ROLES.includes(role)) redirect('/settings/staff?error=Choose a valid role.');

  const supabase = await connectFor(id);
  // .select('id') returns the changed rows. Zero rows means the security rules said no.
  const { data, error } = await supabase.from('staff').update({ role }).eq('id', id).select('id');
  if (error || data.length === 0) {
    console.error('updateRole failed:', error?.message ?? 'no rows updated');
    redirect('/settings/staff?error=Could not change the role.');
  }

  revalidatePath('/settings/staff');
  redirect('/settings/staff?ok=Role updated.');
}

export async function setActive(form: FormData) {
  const id = String(form.get('id'));
  const active = form.get('active') === 'true';

  const supabase = await connectFor(id);
  const { data, error } = await supabase.from('staff').update({ active }).eq('id', id).select('id');
  if (error || data.length === 0) {
    console.error('setActive failed:', error?.message ?? 'no rows updated');
    redirect('/settings/staff?error=Could not update the account.');
  }

  revalidatePath('/settings/staff');
  redirect(`/settings/staff?ok=${active ? 'Account reactivated.' : 'Account deactivated.'}`);
}
