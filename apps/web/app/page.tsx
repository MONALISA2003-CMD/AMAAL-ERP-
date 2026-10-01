'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '../components/brand-logo';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <main className="center-page">
      <BrandLogo variant="full" className="splash-logo" priority />
      <p>Opening secure sign-in…</p>
    </main>
  );
}
