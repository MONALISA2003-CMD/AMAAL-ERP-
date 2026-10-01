'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase';
import { BrandLogo } from '../components/brand-logo';

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const supabase = await getSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        router.replace(data.session ? '/dashboard' : '/login');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to reach the Amaal API.');
      } finally {
        setChecking(false);
      }
    })();
  }, [router]);

  return (
    <main className="center-page">
      <BrandLogo variant="full" className="splash-logo" priority />
      <p>{checking ? 'Checking secure session…' : error ? 'Secure API connection failed.' : 'Redirecting…'}</p>
      {error ? <p className="error-text splash-error">{error}</p> : null}
    </main>
  );
}
