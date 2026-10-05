import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieList = { name: string; value: string; options: CookieOptions }[];

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list: CookieList) => {
          try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* pages can't set cookies; middleware will handle it later */ }
        },
      },
    },
  );
}