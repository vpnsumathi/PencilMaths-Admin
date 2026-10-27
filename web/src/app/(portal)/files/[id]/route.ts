import { NextResponse } from 'next/server';
import { downloadFile } from '@/lib/google/drive';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// Opens a homework file (a hand-in or a corrected sheet) for staff, e.g. on the marking page.
// file_links is only visible to staff, so anyone else gets "Not found".
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse('Not found', { status: 404 });

  const supabase = await createClient();
  const { data: file } = await supabase
    .from('file_links')
    .select('provider, external_id, url, label')
    .eq('id', id)
    .in('owner_type', ['homework_submission', 'homework_correction', 'homework_sheet'])
    .maybeSingle();
  if (!file) return new NextResponse('Not found', { status: 404 });

  if (file.provider !== 'google_drive' || !file.external_id) {
    return file.url ? NextResponse.redirect(file.url) : new NextResponse('Not found', { status: 404 });
  }

  try {
    const drive = await downloadFile(file.external_id);
    return new NextResponse(drive.body, {
      headers: {
        'Content-Type': drive.headers.get('content-type') ?? 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.label ?? 'homework')}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('staff file download failed:', e);
    return new NextResponse('Could not open the file from Google Drive.', { status: 502 });
  }
}
