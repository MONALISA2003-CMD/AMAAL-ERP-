import { redirect } from 'next/navigation';
import { BrandLogo } from '../components/brand-logo';
import { getSetupStatus } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let status;

  try {
    status = await getSetupStatus();
  } catch {
    return (
      <main className="center-page">
        <BrandLogo variant="full" className="splash-logo" priority />
        <p>Amaal is taking a moment to load. Please try again.</p>
        <a className="setup-secondary" href="/">Try again</a>
      </main>
    );
  }

  // Next.js redirect() throws an internal redirect signal. Keep it outside
  // the catch block so a successful setup check is not rendered as an error.
  redirect(status.stage === 'ACTIVATED' ? '/login' : '/setup');
}
