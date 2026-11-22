import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { downloadFile } from '@/lib/google/drive';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// Opens a homework file (the worksheet, a hand-in or a corrected sheet) for staff and the batch's teacher,
// e.g. from the Homework Tracker or the marking page. The server fetches it from the PencilMaths Google Drive and
// passes it on. The database rules decide who may see the file: anyone else gets "Not found".
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    // The log line has Google's reason: e.g. "404 File not found" = the app's Google connection can't see this
    // file; "Google sign-in failed" = the connection itself (GOOGLE_REFRESH_TOKEN) needs renewing.
    console.error('staff file download failed:', e);
    // Staff opening the link as a page (Worksheet, Submitted, Corrected): open the file in Google Drive instead,
    // as the batch page's links do for staff, with their own Google sign-in. Not for teachers (they have no access
    // to the PencilMaths Drive), and not for the marking page, which reads the file itself (it sends
    // sec-fetch-mode "cors"; opening a link sends "navigate").
    const openedAsPage = (request.headers.get('sec-fetch-mode') ?? 'navigate') === 'navigate';
    if (openedAsPage && file.url && (await getViewer())?.kind === 'staff') return NextResponse.redirect(file.url);
    // Everyone else sees Google's reason too (only people allowed to see this file get this far), so a problem with
    // the Drive connection can be told apart from a missing file without opening the server logs.
    const reason = e instanceof Error ? e.message.replace(/^Google Drive download error: /, '') : '';
    return new NextResponse(`Could not open the file from Google Drive.${reason ? ` Google said: ${reason}` : ''}`, { status: 502 });
  }
}
