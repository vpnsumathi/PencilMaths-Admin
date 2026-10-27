import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

// Every page inside (portal) is for active staff, and for teachers (who see only their own batches and students).
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');
    // Not staff or a teacher: students have their own area; anyone else has no access.
    const { data: studentId } = await supabase.rpc('current_student_id');
    redirect(studentId ? '/me' : '/no-access');
  }

  return (
    <AppShell staff={{ full_name: viewer.fullName, role: viewer.kind === 'teacher' ? 'teacher' : viewer.role }}>
      {children}
    </AppShell>
  );
}
