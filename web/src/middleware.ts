import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieList = { name: string; value: string; options: CookieOptions }[];

// Pages anyone can open without signing in.
const PUBLIC_PATHS = ['/login', '/auth', '/h/'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: CookieList) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Is someone signed in? getClaims() checks the login token (see getUserId in lib/auth.ts) and also
  // refreshes the session cookie when it is close to expiring. Pages still check who it is (getViewer),
  // and the database rules check every query.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) return NextResponse.redirect(new URL('/login', request.url));
  if (user && path === '/login') return NextResponse.redirect(new URL('/', request.url));
  return response;
}

// Run on every page, but not on images and Next.js's own files.
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico)$).*)'] };