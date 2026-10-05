import { Suspense } from 'react';
import ResetPasswordContent from './content';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="auth-shell"><section className="auth-panel"><p className="muted">Loading secure password recovery…</p></section></main>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
