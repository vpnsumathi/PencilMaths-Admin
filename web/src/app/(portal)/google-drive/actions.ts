 'use server';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { redirectWith } from '@/lib/form';
import { studentsRootFolder } from '@/lib/google/drive';

// Checks the Google connection by making sure PencilMaths / Students exists in Drive.
export async function testDrive() {
  await requireAdmin();
  let link = '';
  try {
    link = (await studentsRootFolder()).webViewLink;
  } catch (e) {
    console.error('testDrive failed:', e);
    redirectWith('/google-drive', 'error', e instanceof Error ? e.message : 'Could not reach Google Drive.');
  }
  redirect(`/google-drive?ok=${encodeURIComponent('Connected to Google Drive.')}&folder=${encodeURIComponent(link)}`);
}