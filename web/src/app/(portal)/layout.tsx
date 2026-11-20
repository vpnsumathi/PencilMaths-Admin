import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getUserId, getViewer } from '@/lib/auth';
import { messagesMissing } from '@/lib/messages';
import { createClient } from '@/lib/supabase/server';

// Every page inside (portal) is for active staff, and for teachers (who see only their own batches and students).
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) {
    if (!(await getUserId())) redirect('/login');
    // Not staff or a teacher: students have their own area; anyone else has no access.
    const supabase = await createClient();
    const { data: studentId } = await supabase.rpc('current_student_id');
    redirect(studentId ? '/me' : '/no-access');
  }

  // Staff: how many conversations have a student message nobody has opened yet (the number on Messages).
  // One small count; teachers don't message, so they never ask.
  let unread = 0;
  if (viewer.kind === 'staff') {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('office_unread_count');
    if (error) { if (!messagesMissing(error)) console.error('office_unread_count failed:', error.message); } else unread = data ?? 0;
  }

  return (
    <AppShell staff={{ full_name: viewer.fullName, role: viewer.kind === 'teacher' ? 'teacher' : viewer.role }} unread={unread}>
      {children}
    </AppShell>
  );
}
