import type { Metadata, Viewport } from 'next';

import './globals.css';

/**
 * COPY SCAFFOLD, NOT FINAL COPY. Codex owns the polish; this exists so there is
 * a real surface to work on rather than a blank directory.
 *
 * Everything here describes what the app actually does. The previous static
 * page advertised a positioning the parity doctrine retired — "no ads",
 * "$4.99 once" — and shipping that alongside ads and daily rewards would have
 * been false advertising. If a claim below stops being true, it goes.
 */
export const metadata: Metadata = {
  title: 'Mahjong Brain — tile matching that keeps you sharp',
  description:
    'Tile-matching solitaire with a four-slot holder. Tiles big enough to actually read. Free to play.',
  openGraph: {
    title: 'Mahjong Brain',
    description:
      'Tile matching with a four-slot holder. Tiles big enough to read. Free to play.',
    type: 'website',
  },
  icons: { icon: '/favicon.png', apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#003B32',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
