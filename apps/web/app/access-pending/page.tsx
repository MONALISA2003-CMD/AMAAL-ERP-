import { Suspense } from 'react';
import AccessPendingContent from './content';

export default function AccessPendingPage() {
  return (
    <Suspense fallback={<main className="auth-shell"><section className="auth-panel"><p className="muted">Loading Amaal access status…</p></section></main>}>
      <AccessPendingContent />
    </Suspense>
  );
}
