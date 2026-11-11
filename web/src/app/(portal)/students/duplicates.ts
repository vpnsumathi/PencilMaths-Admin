'use server';

import { getViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export type StudentMatch = { id: string; code: string; first_name: string; last_name: string; year_group: number; status: string };

// "Sam", " sam " and "SAM" are the same name. Escapes the ilike wildcards, so "_" or "%" in a name is matched as typed.
const exact = (name: string) => name.replace(/\s+/g, ' ').trim().replace(/[\\%_]/g, (c) => `\\${c}`);

// Students who already have this first name, last name and year group (any status, so a returning student who
// left is found too). Used by the Add student form to warn before a second record is made for the same child.
export async function findStudentMatches(firstName: string, lastName: string, yearGroup: number): Promise<StudentMatch[]> {
  const first = firstName.replace(/\s+/g, ' ').trim();
  const last = lastName.replace(/\s+/g, ' ').trim();
  if (!first || !Number.isInteger(yearGroup)) return [];
  // Staff only (teachers can't add students); anyone else gets nothing.
  const viewer = await getViewer();
  if (viewer?.kind !== 'staff') return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('students')
    .select('id, code, first_name, last_name, year_group, status')
    .ilike('first_name', exact(first))
    .ilike('last_name', exact(last))
    .eq('year_group', yearGroup)
    .order('code')
    .limit(5);
  if (error) {
    console.error('findStudentMatches failed:', error.message);
    return [];
  }
  return data ?? [];
}
