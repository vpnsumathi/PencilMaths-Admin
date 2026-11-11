import { NextResponse } from 'next/server';
import { downloadFile } from '@/lib/google/drive';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// Opens a class note's document for staff and the batch's teacher (teachers have no access to the Pencil Maths
// Google Drive, so the server fetches the file and passes it on). The database rules decide who may see the note:
// anyone else gets "Not found".
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse('Not found', { status: 404 });

  const supabase = await createClient();
  const { data: note } = await supabase
    .from('class_notes')
    .select('provider, external_id, url, file_name, title')
    .eq('id', id)
    .maybeSingle();
  if (!note || !note.provider) return new NextResponse('Not found', { status: 404 });

  if (note.provider !== 'google_drive' || !note.external_id) {
    return note.url ? NextResponse.redirect(note.url) : new NextResponse('Not found', { status: 404 });
  }

  try {
    const drive = await downloadFile(note.external_id);
    return new NextResponse(drive.body, {
      headers: {
        'Content-Type': drive.headers.get('content-type') ?? 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(note.file_name ?? note.title)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('class note download failed:', e);
    return new NextResponse('Could not open the file from Google Drive.', { status: 502 });
  }
}
