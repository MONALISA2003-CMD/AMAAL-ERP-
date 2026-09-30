'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase';

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const supabase = await getSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        router.replace(data.session ? '/dashboard' : '/login');
      } finally {
        setChecking(false);
      }
    })();
  }, [router]);

  return (
    <main className="center-page">
      <div className="brand-mark">AMAAL</div>
      <p>{checking ? 'Checking secure session…' : 'Redirecting…'}</p>
    </main>
  );
}
