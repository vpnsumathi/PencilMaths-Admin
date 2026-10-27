import 'server-only';
import { createStudentFolder } from '@/lib/google/drive';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// Makes sure a student has a Google Drive folder recorded in file_links, and returns its link.
// Safe to call more than once: an existing Drive folder is simply returned.
// `client` is the full-rights connection, passed only when a teacher marks homework for a student who has no
// folder yet (teachers can't read or add student folders), after their access to the student was checked.
export async function ensureStudentDriveFolder(studentId: string, client?: SupabaseClient) {
  const supabase = client ?? await createClient();
  const [{ data: student }, { data: existing }] = await Promise.all([
    supabase.from('students').select('id, code, first_name, last_name').eq('id', studentId).maybeSingle(),
    supabase
      .from('file_links')
      .select('id, provider, url')
      .eq('student_id', studentId)
      .eq('owner_type', 'student_folder')
      .maybeSingle(),
  ]);
  if (!student) throw new Error('Student not found.');
  if (existing?.provider === 'google_drive') return existing.url as string;

  const { folder } = await createStudentFolder(student);

  // A student has one folder row: a pasted link is replaced by the Drive folder.
  if (existing) await supabase.from('file_links').delete().eq('id', existing.id);
  const { error } = await supabase.from('file_links').insert({
    owner_type: 'student_folder',
    owner_id: student.id,
    student_id: student.id,
    provider: 'google_drive',
    external_id: folder.id,
    url: folder.webViewLink,
    label: 'Student folder',
  });
  if (error) throw new Error(`Folder made in Drive but not saved: ${error.message}`);
  return folder.webViewLink;
}