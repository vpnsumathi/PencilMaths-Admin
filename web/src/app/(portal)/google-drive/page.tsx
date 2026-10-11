import { Alerts } from '@/components/Alerts';
import ui from '@/components/ui.module.css';
import { requireAdmin } from '@/lib/auth';
import { testDrive } from './actions';

export const metadata = { title: 'Google Drive' };

type Props = { searchParams: Promise<{ ok?: string; error?: string; folder?: string }> };

export default async function GoogleDrivePage({ searchParams }: Props) {
  await requireAdmin();
  const { ok, error: problem, folder } = await searchParams;
  // Only show the settings' presence, never their values.
  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
  const folderLink = folder?.startsWith('https://drive.google.com/') ? folder : null;

  return (
    <>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>Google Drive</h1>
          <p className={ui.subtitle}>Student folders and homework files are stored in PencilMaths / Students.</p>
        </div>
      </div>
      <Alerts ok={ok} problem={problem} />

      <section className={ui.card} style={{ maxWidth: 640 }}>
        <h2>Connection</h2>
        <p>Google settings: {configured ? '✅ found' : '❌ missing: add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN'}</p>
        {folderLink && (
          <p><a href={folderLink} target="_blank" rel="noreferrer" className={ui.link}>Open PencilMaths / Students in Drive →</a></p>
        )}
        <form action={testDrive} className={ui.formActions}>
          <button className={ui.primaryButton} disabled={!configured}>Test connection</button>
        </form>
      </section>
    </>
  );
}