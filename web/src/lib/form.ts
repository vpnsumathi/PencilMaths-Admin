import { redirect } from 'next/navigation';

// Helpers for server actions that read HTML forms.

export const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
export const optional = (form: FormData, key: string) => text(form, key) || null;
export const optionalNumber = (form: FormData, key: string) => {
  const value = text(form, key);
  return value ? Number(value) : null;
};

// Go to a page with a green (ok) or red (error) message in the address.
export function redirectWith(path: string, kind: 'ok' | 'error', message: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}
