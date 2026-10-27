import Link from 'next/link';
import { notFound } from 'next/navigation';
import ui from '@/components/ui.module.css';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { Marker } from './Marker';
import type { Drawings } from './marks';

export const metadata = { title: 'Mark homework' };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sheet?: string; student?: string; file?: string }>;
};

// Marking page: opens one student's handed-in homework in the browser to draw on, type on and tick,
// then sends the marked PDF to the student as their corrected sheet. Opened in a new tab from the batch page.
export default async function MarkPage({ params, searchParams }: Props) {
  const { id: batchId } = await params;
  const { sheet: sheetId = '', student: studentId = '', file: fileId } = await searchParams;
  if (![batchId, sheetId, studentId].every((v) => UUID.test(v))) notFound();

  const supabase = await createClient();
  const [{ data: sheet }, { data: student }, { data: result }, { data: files }, { data: markup }] = await Promise.all([
    supabase.from('homework_sheets').select('id, title, max_mark').eq('id', sheetId).eq('batch_id', batchId).maybeSingle(),
    supabase.from('students').select('first_name, last_name').eq('id', studentId).maybeSingle(),
    supabase.from('homework_results').select('status, mark').eq('sheet_id', sheetId).eq('student_id', studentId).maybeSingle(),
    supabase.from('file_links').select('id, label, url')
      .eq('owner_type', 'homework_submission').eq('owner_id', sheetId).eq('student_id', studentId).order('created_at'),
    supabase.from('homework_markups').select('source_file_id, data, updated_at, draft_file_id, draft_mark')
      .eq('sheet_id', sheetId).eq('student_id', studentId).maybeSingle(),
  ]);
  if (!sheet || !student || !result) notFound();

  const handedIn = files ?? [];
  // The file to mark: the one asked for, else the one marked before, else the latest hand-in.
  const file = handedIn.find((f) => f.id === fileId)
    ?? handedIn.find((f) => f.id === markup?.source_file_id)
    ?? handedIn.at(-1);
  const back = `/batches/${batchId}#homework`;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <p style={{ margin: '0 0 4px' }}><Link href={back} className={ui.link}>← Back to the batch</Link></p>
      <h1 style={{ margin: '0 0 4px' }}>Mark: {student.first_name} {student.last_name}</h1>
      <p className={ui.muted} style={{ margin: '0 0 12px' }}>{sheet.title}</p>

      {handedIn.length > 1 && (
        <p className={ui.formActions} style={{ margin: '0 0 12px' }}>
          <strong>Handed-in files:</strong>
          {handedIn.map((f, i) => (
            <Link key={f.id} className={f.id === file?.id ? ui.primaryButton : ui.button}
              href={`/batches/${batchId}/mark?sheet=${sheetId}&student=${studentId}&file=${f.id}`}>
              File {i + 1}
            </Link>
          ))}
        </p>
      )}

      {file ? (
        <Marker
          key={file.id}
          ids={{ batchId, sheetId, studentId }}
          file={{ id: file.id, url: `/files/${file.id}`, driveUrl: file.url, label: file.label ?? 'homework' }}
          maxMark={sheet.max_mark}
          mark={markup?.draft_file_id && markup.draft_mark !== null ? markup.draft_mark : result.mark}
          marked={result.status === 'marked'}
          saved={markup && markup.source_file_id === file.id
            ? { drawings: markup.data as Drawings, at: Date.parse(markup.updated_at) }
            : null}
          unsent={!!markup?.draft_file_id && markup.source_file_id === file.id}
        />
      ) : (
        <p className={ui.card}>{student.first_name} hasn&apos;t handed in a file for this homework yet.</p>
      )}
    </div>
  );
}
