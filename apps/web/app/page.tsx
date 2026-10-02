import { redirect } from 'next/navigation';
import { BrandLogo } from '../components/brand-logo';
import { getSetupStatus } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  try {
    const status = await getSetupStatus();
    redirect(status.stage === 'ACTIVATED' ? '/login' : '/setup');
  } catch {
    return (
      <main className="center-page">
        <BrandLogo variant="full" className="splash-logo" priority />
        <p>Amaal is taking a moment to load. Please try again.</p>
        <a className="setup-secondary" href="/">Try again</a>
      </main>
    );
  }
}
