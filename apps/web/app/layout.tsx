import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Amaal ERP',
  description: 'Amaal Internal ERP and Intelligent Operations Platform',
  icons: {
    icon: '/brand/amaal-icon.png',
    shortcut: '/brand/amaal-icon.png',
    apple: '/brand/amaal-icon.png',
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
