import Link from 'next/link';
import { Alerts } from '@/components/Alerts';
import ui from '@/components/ui.module.css';
import { requireStaff } from '@/lib/auth';
import { messagesMissing, MESSAGES_NOT_READY, type Audiences } from '@/lib/messages';
import { createClient } from '@/lib/supabase/server';
import { NewMessageForm, type Pickable } from './NewMessageForm';

export const metadata = { title: 'New message' };

type Props = { searchParams: Promise<{ ok?: string; error?: string }> };

// Send a message to chosen students, a batch, a year group or every current student.
// Each student gets their own copy in their own conversation, so replies stay private.
export default async function NewMessagePage({ searchParams }: Props) {
  await requireStaff('/messages');
  const { ok, error: problem } = await searchParams;
  const supabase = await createClient();
  const [{ data: audiences, error }, { data: students }] = await Promise.all([
    supabase.rpc('message_audiences'),
    supabase.from('students').select('id, first_name, last_name, code, year_group').neq('status', 'left')
      .order('first_name').order('last_name').limit(1000),
  ]);
  if (error && !messagesMissing(error)) throw error;

  return (
    <>
      <Link href="/messages" className={ui.back}>← Messages</Link>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>New message</h1>
          <p className={ui.subtitle}>Each student gets their own copy under Messages in their login, and can reply privately.</p>
        </div>
      </div>
      <Alerts ok={ok} problem={problem} />
      {error ? <p className={`${ui.alert} ${ui.alertWarn}`}>{MESSAGES_NOT_READY}</p> : (
        <NewMessageForm audiences={audiences as Audiences} students={(students ?? []) as Pickable[]} />
      )}
    </>
  );
}
