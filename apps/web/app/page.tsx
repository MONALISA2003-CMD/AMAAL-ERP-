'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../lib/supabase';

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data }) => {
      router.replace(data.session ? '/dashboard' : '/login');
      setChecking(false);
    });
  }, [router]);

  return (
    <main className="center-page">
      <div className="brand-mark">AMAAL</div>
      <p>{checking ? 'Checking secure session…' : 'Redirecting…'}</p>
    </main>
  );
}
