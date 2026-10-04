import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'Pencil Maths Admin', template: '%s · Pencil Maths Admin' },
  robots: { index: false, follow: false }, // keep the admin portal out of search engines
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#4f46e5',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body className={geistSans.variable}>{children}</body>
    </html>
  );
}
