'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '../../components/brand-logo';
import { getSetupStatus, initializeAmaal, type AmaalSetupStatus } from '../../lib/api';

type RegionDraft = { code: string; name: string };
type WarehouseDraft = { code: string; name: string; regionCode: string };

type Draft = {
  ceoEmail: string;
  ceoDisplayName: string;
  ceoEmployeeNumber: string;
  regions: RegionDraft[];
  regionalWarehouses: WarehouseDraft[];
};

const STORAGE_KEY = 'amaal.setup.draft.v3';

const initialDraft: Draft = {
  ceoEmail: '',
  ceoDisplayName: '',
  ceoEmployeeNumber: '',
  regions: [{ code: 'CENTRAL', name: 'Central' }],
  regionalWarehouses: [{ code: 'CENTRAL-01', name: 'Central Warehouse', regionCode: 'CENTRAL' }],
};

function loadDraft(): Draft {
  if (typeof window === 'undefined') return initialDraft;
  try {
    const rawCurrent = window.localStorage.getItem(STORAGE_KEY);
    const rawLegacy = window.localStorage.getItem('amaal.setup.draft.v2');
    const parsed = JSON.parse(rawCurrent ?? rawLegacy ?? 'null') as Partial<Draft> | null;
    if (!parsed) return initialDraft;
    return {
      ...initialDraft,
      ...parsed,
      ceoEmail: typeof parsed.ceoEmail === 'string' ? parsed.ceoEmail : '',
      ceoDisplayName: typeof parsed.ceoDisplayName === 'string' ? parsed.ceoDisplayName : '',
      ceoEmployeeNumber: typeof parsed.ceoEmployeeNumber === 'string' ? parsed.ceoEmployeeNumber : '',
      regions: Array.isArray(parsed.regions) && parsed.regions.length
        ? parsed.regions.map((region) => ({ code: String(region?.code ?? ''), name: String(region?.name ?? '') }))
        : initialDraft.regions,
      regionalWarehouses: Array.isArray(parsed.regionalWarehouses)
        ? parsed.regionalWarehouses.map((warehouse) => ({
            code: String(warehouse?.code ?? ''),
            name: String(warehouse?.name ?? ''),
            regionCode: String(warehouse?.regionCode ?? ''),
          }))
        : initialDraft.regionalWarehouses,
    };
  } catch {
    return initialDraft;
  }
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

function canonicalRegionCode(value: string, regions: RegionDraft[]): string {
  const normalized = normalizeCode(value);
  const match = regions.find((region) =>
    normalizeCode(region.code) === normalized || normalizeCode(region.name) === normalized,
  );
  return match ? normalizeCode(match.code) : normalized;
}

export default function SetupPage() {
  const router = useRouter();
  const [status, setStatus] = useState<AmaalSetupStatus | null>(null);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [activationCode, setActivationCode] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    setDraft(loadDraft());
    void (async () => {
      try {
        const current = await getSetupStatus();
        setStatus(current);
        if (current.stage === 'ACTIVATED') {
          router.replace('/login');
          return;
        }
        if (current.stage === 'ORGANIZATION_READY') setComplete(true);
      } catch {
        setError('Amaal could not load its setup status. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (typeof window === 'undefined' || complete) return;
    const safeDraft = { ...draft };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeDraft));
  }, [draft, complete]);

  const regionOptions = useMemo(() => draft.regions
    .map((region) => ({ code: normalizeCode(region.code), name: region.name.trim() }))
    .filter((region) => region.code), [draft.regions]);

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function validateCurrentStep(): string | null {
    if (step === 1) return null;
    if (step === 2) {
      if (!draft.regions.length) return 'Add at least one operating region.';
      if (draft.regions.some((region) => !normalizeCode(region.code) || !region.name.trim())) return 'Complete every region before continuing.';
      const activeWarehouses = draft.regionalWarehouses.filter((warehouse) =>
        normalizeCode(warehouse.code) || warehouse.name.trim() || normalizeCode(warehouse.regionCode),
      );
      if (activeWarehouses.some((warehouse) => {
        const regionCode = canonicalRegionCode(warehouse.regionCode, draft.regions);
        return !normalizeCode(warehouse.code) ||
          !warehouse.name.trim() ||
          !regionOptions.some((region) => region.code === regionCode);
      })) {
        return 'Complete every regional warehouse or remove it.';
      }
      const regionCodes = draft.regions.map((region) => normalizeCode(region.code));
      if (new Set(regionCodes).size !== regionCodes.length) return 'Each region code must be unique.';
    }
    if (step === 3) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.ceoEmail.trim())) return 'Enter a valid CEO email address.';
      if (draft.ceoDisplayName.trim().length < 2) return 'Enter the CEO display name.';
    }
    return null;
  }

  function next() {
    const validation = validateCurrentStep();
    if (validation) { setError(validation); return; }
    setError('');
    setStep((current) => Math.min(current + 1, 4));
  }

  function back() {
    setError('');
    setStep((current) => Math.max(current - 1, 1));
  }

  function addRegion() {
    const nextNumber = draft.regions.length + 1;
    updateDraft('regions', [...draft.regions, { code: `REGION-${nextNumber}`, name: '' }]);
  }

  function removeRegion(index: number) {
    setDraft((current) => {
      const removed = current.regions[index];
      const removedCode = removed ? normalizeCode(removed.code) : '';
      return {
        ...current,
        regions: current.regions.filter((_, currentIndex) => currentIndex !== index),
        regionalWarehouses: removedCode
          ? current.regionalWarehouses.filter((warehouse) => canonicalRegionCode(warehouse.regionCode, current.regions) !== removedCode)
          : current.regionalWarehouses,
      };
    });
  }

  function addWarehouse() {
    const regionCode = regionOptions[0]?.code ?? '';
    const nextNumber = draft.regionalWarehouses.length + 1;
    updateDraft('regionalWarehouses', [...draft.regionalWarehouses, { code: `WH-${nextNumber}`, name: '', regionCode }]);
  }

  function removeWarehouse(index: number) {
    updateDraft('regionalWarehouses', draft.regionalWarehouses.filter((_, current) => current !== index));
  }

  async function completeSetup() {
    const validation = validateCurrentStep();
    if (validation) { setError(validation); return; }
    if (!activationCode.trim()) { setError('Enter the Amaal activation code.'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await initializeAmaal({
        activationCode: activationCode.trim(),
        ceoEmail: draft.ceoEmail.trim(),
        ceoDisplayName: draft.ceoDisplayName.trim(),
        ...(draft.ceoEmployeeNumber.trim() ? { ceoEmployeeNumber: draft.ceoEmployeeNumber.trim() } : {}),
        regions: draft.regions.map((region) => ({ code: normalizeCode(region.code), name: region.name.trim() })),
        regionalWarehouses: draft.regionalWarehouses
          .filter((warehouse) => normalizeCode(warehouse.code) || warehouse.name.trim() || warehouse.regionCode.trim())
          .map((warehouse) => ({
            code: normalizeCode(warehouse.code),
            name: warehouse.name.trim(),
            regionCode: canonicalRegionCode(warehouse.regionCode, draft.regions),
          })),
      });
      if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
      setComplete(true);
      setStatus((current) => current ? { ...current, stage: result.stage, pendingCeo: { email: draft.ceoEmail.trim(), displayName: draft.ceoDisplayName.trim(), employeeNumber: draft.ceoEmployeeNumber.trim() || null } } : current);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Amaal could not finish setup.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="setup-page"><section className="setup-shell setup-loading"><BrandLogo variant="mark" className="setup-mark" priority /><p>Preparing Amaal…</p></section></main>;
  }

  if (complete || status?.stage === 'ORGANIZATION_READY') {
    return (
      <main className="setup-page">
        <section className="setup-shell setup-complete">
          <BrandLogo variant="full" className="setup-logo" priority />
          <div className="setup-check">✓</div>
          <p className="setup-kicker">Amaal is ready</p>
          <h1>Your organization is set up.</h1>
          <p className="setup-lead">The Amaal foundation is in place and ready for secure access.</p>
          <div className="setup-summary">
            <div><span>Company</span><strong>{status?.organization.name ?? 'Amaal'}</strong></div>
            <div><span>Regions</span><strong>{status?.regions.length ?? draft.regions.length}</strong></div>
            <div><span>CEO</span><strong>{status?.pendingCeo?.displayName ?? draft.ceoDisplayName}</strong></div>
          </div>
          <div className="setup-next">
            <strong>Next</strong>
            <p>Create the CEO sign-in, confirm the activation code, and finish security setup.</p>
          </div>
          <div className="setup-actions">
            <button type="button" className="setup-primary" onClick={() => router.replace('/signup')}>Create CEO access</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="setup-page">
      <section className="setup-shell">
        <header className="setup-header">
          <BrandLogo variant="full" className="setup-logo" priority />
          <div>
            <p className="setup-kicker">Amaal setup</p>
            <h1>Set up Amaal</h1>
            <p className="setup-lead">Get your company foundation ready before your first secure sign-in.</p>
          </div>
        </header>

        <div className="setup-progress" aria-label="Setup progress">
          {[1,2,3,4].map((item) => <span key={item} className={item <= step ? 'active' : ''}>{item}</span>)}
        </div>

        {step === 1 ? (
          <section className="setup-section">
            <p className="setup-kicker">Welcome</p>
            <h2>Start with the Amaal foundation</h2>
            <p className="setup-lead">Amaal is a single company system. This first step prepares the organization, operating regions and the first CEO definition.</p>
            <div className="setup-cards">
              <div className="setup-card"><span>Company</span><strong>{status?.organization.name ?? 'Amaal'}</strong><p>Your company foundation is already present.</p></div>
              <div className="setup-card"><span>Master Warehouse</span><strong>{status?.masterWarehouse?.name ?? 'Master Warehouse'}</strong><p>Your central stock location is ready.</p></div>
              <div className="setup-card"><span>Security</span><strong>CEO controlled</strong><p>Privileged account security is completed after this organization setup.</p></div>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="setup-section">
            <p className="setup-kicker">Organization</p>
            <h2>Define the operating structure</h2>
            <p className="setup-lead">Add the regions Amaal will operate in. Regional warehouses are optional and can be added now or later.</p>
            <div className="setup-list">
              {draft.regions.map((region, index) => (
                <div className="setup-row" key={`region-${index}`}>
                  <input aria-label={`Region ${index + 1} code`} value={region.code} onChange={(e) => updateDraft('regions', draft.regions.map((item, current) => current === index ? { ...item, code: e.target.value } : item))} placeholder="Region code" />
                  <input aria-label={`Region ${index + 1} name`} value={region.name} onChange={(e) => updateDraft('regions', draft.regions.map((item, current) => current === index ? { ...item, name: e.target.value } : item))} placeholder="Region name" />
                  <button type="button" className="setup-remove" onClick={() => removeRegion(index)} disabled={draft.regions.length === 1}>Remove</button>
                </div>
              ))}
            </div>
            <button type="button" className="setup-secondary" onClick={addRegion}>+ Add region</button>

            <div className="setup-divider" />
            <div className="setup-section-head"><div><p className="setup-kicker">Warehouses</p><h3>Regional warehouses</h3></div><button type="button" className="setup-secondary" onClick={addWarehouse}>+ Add warehouse</button></div>
            <div className="setup-list">
              {draft.regionalWarehouses.map((warehouse, index) => (
                <div className="setup-row setup-row-warehouse" key={`warehouse-${index}`}>
                  <input aria-label={`Warehouse ${index + 1} code`} value={warehouse.code} onChange={(e) => updateDraft('regionalWarehouses', draft.regionalWarehouses.map((item, current) => current === index ? { ...item, code: e.target.value } : item))} placeholder="Warehouse code" />
                  <input aria-label={`Warehouse ${index + 1} name`} value={warehouse.name} onChange={(e) => updateDraft('regionalWarehouses', draft.regionalWarehouses.map((item, current) => current === index ? { ...item, name: e.target.value } : item))} placeholder="Warehouse name" />
                  <select aria-label={`Warehouse ${index + 1} region`} value={warehouse.regionCode} onChange={(e) => updateDraft('regionalWarehouses', draft.regionalWarehouses.map((item, current) => current === index ? { ...item, regionCode: e.target.value } : item))}>
                    {regionOptions.map((region) => <option key={region.code} value={region.code}>{region.name || region.code}</option>)}
                  </select>
                  <button type="button" className="setup-remove" onClick={() => removeWarehouse(index)}>Remove</button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="setup-section">
            <p className="setup-kicker">First leader</p>
            <h2>Define the CEO account</h2>
            <p className="setup-lead">The CEO will be the first person with full control of the Amaal workspace.</p>
            <div className="setup-form-grid">
              <label><span>CEO display name</span><input autoComplete="name" value={draft.ceoDisplayName} onChange={(e) => updateDraft('ceoDisplayName', e.target.value)} placeholder="Full name" /></label>
              <label><span>Work email</span><input autoComplete="email" inputMode="email" value={draft.ceoEmail} onChange={(e) => updateDraft('ceoEmail', e.target.value)} placeholder="name@company.com" /></label>
              <label><span>Employee number <em>optional</em></span><input value={draft.ceoEmployeeNumber} onChange={(e) => updateDraft('ceoEmployeeNumber', e.target.value)} placeholder="Optional" /></label>
              <label><span>Amaal activation code</span><input type="password" autoComplete="off" value={activationCode} onChange={(e) => setActivationCode(e.target.value)} placeholder="Enter activation code" /></label>
            </div>
            <div className="setup-note">Your secure sign-in will be completed after the organization details are saved.</div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="setup-section">
            <p className="setup-kicker">Review</p>
            <h2>Ready to activate the Amaal foundation?</h2>
            <p className="setup-lead">Review the organization details below. This step creates the Amaal operating foundation and records the pending CEO identity for secure activation.</p>
            <div className="setup-review-grid">
              <div><span>Company</span><strong>{status?.organization.name ?? 'Amaal'}</strong></div>
              <div><span>Master warehouse</span><strong>{status?.masterWarehouse?.name ?? 'Master Warehouse'}</strong></div>
              <div><span>CEO</span><strong>{draft.ceoDisplayName}</strong><small>{draft.ceoEmail}</small></div>
              <div><span>Regions</span><strong>{draft.regions.length}</strong><small>{draft.regions.map((region) => region.name).join(', ')}</small></div>
              <div><span>Regional warehouses</span><strong>{draft.regionalWarehouses.length}</strong></div>
              <div><span>Policies</span><strong>Ready for configuration</strong><small>Pricing, commission, bonus, aging, recovery and approvals will use the CEO policy layer.</small></div>
            </div>
          </section>
        ) : null}

        {error ? <div className="setup-error" role="alert">{error}</div> : null}

        <footer className="setup-actions">
          {step > 1 ? <button type="button" className="setup-secondary" onClick={back} disabled={busy}>Back</button> : <span />}
          {step < 4 ? <button type="button" className="setup-primary" onClick={next}>Continue</button> : <button type="button" className="setup-primary" onClick={() => void completeSetup()} disabled={busy}>{busy ? 'Setting up Amaal…' : 'Complete setup'}</button>}
        </footer>
      </section>
    </main>
  );
}
