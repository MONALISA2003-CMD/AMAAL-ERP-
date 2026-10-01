'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '../components/brand-logo';
import { getSetupStatus } from '../lib/api';

export default function HomePage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const status = await getSetupStatus();
        router.replace(status.stage === 'ACTIVATED' ? '/login' : '/setup');
      } catch {
        setError('Amaal is taking a moment to load. Please try again.');
      }
    })();
  }, [router]);

  return (
    <main className="center-page">
      <BrandLogo variant="full" className="splash-logo" priority />
      <p>{error || 'Preparing Amaal…'}</p>
      {error ? <button type="button" className="setup-secondary" onClick={() => window.location.reload()}>Try again</button> : null}
    </main>
  );
}
