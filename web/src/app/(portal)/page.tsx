import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/actions';

// Temporary home page: shows who is signed in. Becomes the dashboard in Piece 8.
export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: staff } = await supabase.from('staff').select('full_name, role').eq('id', user.id).maybeSingle();

  return (
    <main style={{ padding: 24 }}>
      <p>Signed in as {staff?.full_name ?? user.email} ({staff?.role ?? 'not staff'})</p>
      <form action={signOut}><button>Sign out</button></form>
    </main>
  );
}