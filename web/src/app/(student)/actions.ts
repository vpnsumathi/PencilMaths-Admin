'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// Family login: show another child linked to the same login. The database checks the child is theirs.
export async function switchStudent(form: FormData) {
  const id = String(form.get('student_id') ?? '');
  if (UUID.test(id)) {
    const supabase = await createClient();
    const { error } = await supabase.rpc('switch_student', { p_student: id });
    if (error) console.error('switchStudent failed:', error.message);
  }
  revalidatePath('/me', 'layout');
  redirect('/me');
}
