'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const ROLES = ['admin', 'operations', 'head_teacher'];

// Shared start for every staff change: must be signed in, and not changing their own account.
async function connectFor(targetId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (targetId === user.id) redirect('/staff?error=You cannot change your own account.');
  return supabase;
}

export async function updateRole(form: FormData) {
  const id = String(form.get('id'));
  const role = String(form.get('role'));
  if (!ROLES.includes(role)) redirect('/staff?error=Choose a valid role.');

  const supabase = await connectFor(id);
  // .select('id') returns the changed rows. Zero rows means the security rules said no.
  const { data, error } = await supabase.from('staff').update({ role }).eq('id', id).select('id');
  if (error || data.length === 0) {
    console.error('updateRole failed:', error?.message ?? 'no rows updated');
    redirect('/staff?error=Could not change the role.');
  }

  revalidatePath('/staff');
  redirect('/staff?ok=Role updated.');
}

export async function setActive(form: FormData) {
  const id = String(form.get('id'));
  const active = form.get('active') === 'true';

  const supabase = await connectFor(id);
  const { data, error } = await supabase.from('staff').update({ active }).eq('id', id).select('id');
  if (error || data.length === 0) {
    console.error('setActive failed:', error?.message ?? 'no rows updated');
    redirect('/staff?error=Could not update the account.');
  }

  revalidatePath('/staff');
  redirect(`/staff?ok=${active ? 'Account reactivated.' : 'Account deactivated.'}`);
}
