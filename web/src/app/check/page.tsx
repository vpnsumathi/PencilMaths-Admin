import { createClient } from '@/lib/supabase/server';

export default async function Check() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('subjects').select('name');
  if (error) return <p>Not connected: {error.message}</p>;
  return <p>Connected to Supabase. Subjects visible: {data.length}</p>;
}