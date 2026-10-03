import { Suspense } from 'react';
import SignupContent from './content';

export default function SignupPage() {
  return (
    <Suspense fallback={<main className="auth-shell"><section className="auth-panel"><p className="muted">Loading secure signup…</p></section></main>}>
      <SignupContent />
    </Suspense>
  );
}
