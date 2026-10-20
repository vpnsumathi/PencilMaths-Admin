import { NextResponse } from 'next/server';
import { downloadFile } from '@/lib/google/drive';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

type SheetFile = { provider: string; external_id: string | null; url: string | null; label: string | null };

// Opens a homework sheet for the signed-in student. Drive files are private to Pencil Maths,
// so the server fetches the file and passes it on; links just redirect.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse('Not found', { status: 404 });

  const supabase = await createClient();
  const { data } = await supabase.rpc('my_homework_file', { p_file: id });
  const file = data as SheetFile | null;
  if (!file) return new NextResponse('Not found', { status: 404 });

  if (file.provider !== 'google_drive' || !file.external_id) {
    return file.url ? NextResponse.redirect(file.url) : new NextResponse('Not found', { status: 404 });
  }

  try {
    const drive = await downloadFile(file.external_id);
    const name = file.label ?? 'homework';
    return new NextResponse(drive.body, {
      headers: {
        'Content-Type': drive.headers.get('content-type') ?? 'application/octet-stream',
        // "inline" opens PDFs and photos in the browser; the browser's own save button downloads them.
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('homework file download failed:', e);
    return new NextResponse('Could not open the file. Please tell Pencil Maths.', { status: 502 });
  }
}
