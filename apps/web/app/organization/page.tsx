'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getSetupStatus, type AmaalSetupStatus } from '../../lib/api';
import { authClient } from '../../lib/auth';
import { BrandLogo } from '../../components/brand-logo';

type Person = {
  userId: string;
  email: string | null;
  displayName: string;
  employeeNumber: string | null;
  phone: string | null;
  profileStatus: string;
  role: string;
  regionId: string | null;
  regionCode: string | null;
  regionName: string | null;
  managerUserId: string | null;
  managerName: string | null;
  teamId: string | null;
  teamCode: string | null;
  teamName: string | null;
  shopId: string | null;
  shopCode: string | null;
  shopName: string | null;
};

const roleOrder = ['REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER'];

export default function OrganizationPage() {
  const router = useRouter();
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<AmaalSetupStatus | null>(null);
  const [action, setAction] = useState('');
  const [actionError, setActionError] = useState('');
  const [regionForm, setRegionForm] = useState({ code: '', name: '' });
  const [teamForm, setTeamForm] = useState({ regionId: '', managerUserId: '', teamCode: '', teamName: '' });
  const [shopForm, setShopForm] = useState({ teamId: '', shopCode: '', shopName: '', location: '' });
  const [personForm, setPersonForm] = useState({ userId: '', displayName: '', employeeNumber: '', phone: '', role: 'AGENT', regionId: '', managerUserId: '', teamId: '', shopId: '' });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await authClient.getSession();
        if (!session?.data) { router.replace('/login'); return; }
        const [setupStatus, payload] = await Promise.all([getSetupStatus(), apiFetch<{ items: Person[] }>('/v1/org/directory')]);
        if (active) setSetup(setupStatus);
        if (active) setPeople(payload.items);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Unable to load organizational structure.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [router]);

  const regions = useMemo(() => {
    const map = new Map<string, { id: string; code: string; name: string }>();
    for (const r of setup?.regions ?? []) map.set(r.id, r);
    for (const p of people) if (p.regionId && !map.has(p.regionId)) map.set(p.regionId, { id: p.regionId, code: p.regionCode ?? '—', name: p.regionName ?? p.regionId });
    return [...map.values()];
  }, [setup, people]);
  const managers = useMemo(() => people.filter((p) => p.role === 'MANAGER'), [people]);
  const teams = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const p of people) if (p.teamId) map.set(p.teamId, { id: p.teamId, name: p.teamName ?? p.teamId });
    return [...map.values()];
  }, [people]);

  async function runAction(label: string, path: string, body: unknown) {
    setAction(label); setActionError('');
    try {
      await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
      const payload = await apiFetch<{ items: Person[] }>('/v1/org/directory');
      setPeople(payload.items);
      setActionError('');
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : `Unable to ${label.toLowerCase()}.`);
      return false;
    } finally {
      setAction('');
    }
  }

  async function submitRegion(e: React.FormEvent) {
    e.preventDefault();
    if (await runAction('Create region', '/v1/org/regions', regionForm)) setRegionForm({ code: '', name: '' });
  }
  async function submitTeam(e: React.FormEvent) {
    e.preventDefault();
    if (await runAction('Create team', '/v1/org/teams', teamForm)) setTeamForm({ regionId: '', managerUserId: '', teamCode: '', teamName: '' });
  }
  async function submitShop(e: React.FormEvent) {
    e.preventDefault();
    if (await runAction('Create shop', '/v1/org/shops', shopForm)) setShopForm({ teamId: '', shopCode: '', shopName: '', location: '' });
  }
  async function submitPerson(e: React.FormEvent) {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(personForm).map(([k, v]) => [k, v || undefined]));
    if (await runAction('Provision identity', '/v1/org/people', body)) setPersonForm({ userId: '', displayName: '', employeeNumber: '', phone: '', role: 'AGENT', regionId: '', managerUserId: '', teamId: '', shopId: '' });
  }

  const counts = useMemo(() => roleOrder.reduce<Record<string, number>>((acc, role) => {
    acc[role] = people.filter((person) => person.role === role).length;
    return acc;
  }, {}), [people]);

  const grouped = useMemo(() => {
    const regions = new Map<string, { code: string; name: string; managers: Map<string, { name: string; teams: Map<string, { name: string; people: Person[] }> }> }>();
    for (const person of people) {
      const regionKey = person.regionId ?? 'unassigned';
      if (!regions.has(regionKey)) regions.set(regionKey, { code: person.regionCode ?? '—', name: person.regionName ?? 'Unassigned region', managers: new Map() });
      const region = regions.get(regionKey)!;
      const managerKey = person.managerUserId ?? person.userId;
      if (!region.managers.has(managerKey)) region.managers.set(managerKey, { name: person.managerName ?? (person.role === 'MANAGER' ? person.displayName : 'Unassigned manager'), teams: new Map() });
      const manager = region.managers.get(managerKey)!;
      const teamKey = person.teamId ?? `${person.userId}:none`;
      if (!manager.teams.has(teamKey)) manager.teams.set(teamKey, { name: person.teamName ?? (person.role === 'MANAGER' ? 'Manager level' : 'Unassigned team'), people: [] });
      manager.teams.get(teamKey)!.people.push(person);
    }
    return [...regions.values()];
  }, [people]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-brand"><BrandLogo variant="full" className="topbar-full-logo" priority /><div className="topbar-subtitle">People & Structure</div></div>
        <button className="ghost-button" onClick={() => router.push('/dashboard')}>Command Center</button>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="section-label">ORGANIZATION</div>
          <a className="nav-item active" href="/organization">People & Structure</a>
          <div className="section-label lower">OPERATIONS</div>
          <a className="nav-item" href="/dashboard">Command Center</a>
          <a className="nav-item" href="/dashboard#inventory">Inventory & IMEI</a>
          <a className="nav-item" href="/dashboard#sales">Sales & Receipts</a>
          <a className="nav-item" href="/dashboard#recovery">Recovery</a>
          <div className="section-label lower">INTELLIGENCE</div>
          <a className="nav-item" href="/dashboard#amaal-ai">Amaal AI</a>
        </aside>
        <section className="content">
          <div className="content-header">
            <div><div className="eyebrow">PHASE 2B</div><h1>Organizational command map</h1><p className="muted">Identity, hierarchy and scope are now visible from one governed source.</p></div>
            <div className="status-pill ready">Scoped</div>
          </div>
          {error ? <div className="alert-card">{error}</div> : null}
          <div className="grid three">
            {roleOrder.map((role) => <section className="card module" key={role}><div className="module-icon">{counts[role] ?? 0}</div><h3>{role.replace('_',' ')}</h3><p>Active identities visible inside your authorized scope.</p><span>Scoped</span></section>)}
          </div>
          <section className="card">
            <div className="card-label">HIERARCHY</div>
            {loading ? <p className="muted">Loading organizational structure…</p> : grouped.length === 0 ? <p className="muted">No subordinate identities are provisioned yet.</p> : grouped.map((region) => (
              <div className="roadmap" key={region.code+region.name}>
                <div className="roadmap-item current"><span>REGION</span><div><strong>{region.name}</strong><p>{region.code}</p></div></div>
                {[...region.managers.entries()].map(([managerKey, manager]) => <div className="roadmap-item" key={managerKey}><span>MGR</span><div><strong>{manager.name}</strong><p>{manager.teams.size} team scope(s)</p>
                  {[...manager.teams.entries()].map(([teamKey, team]) => <div className="scope-grid" key={teamKey}><div><span>{team.name}</span><strong>{team.people.length}</strong></div><div><span>Team Leader</span><strong>{team.people.filter((p) => p.role === 'TEAM_LEADER').length}</strong></div><div><span>Agents</span><strong>{team.people.filter((p) => p.role === 'AGENT').length}</strong></div><div><span>Shop Owners</span><strong>{team.people.filter((p) => p.role === 'SHOP_OWNER').length}</strong></div></div>)}
                </div></div>)}
              </div>
            ))}
          </section>
          <section className="card">
            <div className="card-label">2B CONTROL PLANE</div>
            <p className="muted">Recruitment and structure mutations are deliberately scoped by Render authorization. This screen provides the operator surface; the API remains the security boundary.</p>
            {actionError ? <div className="alert-card">{actionError}</div> : null}
            <div className="grid two">
              <form className="setup-form-grid" onSubmit={submitRegion}>
                <div><strong>Region</strong><p className="muted">CEO/Admin structure action.</p></div>
                <label>Code<input value={regionForm.code} onChange={(e) => setRegionForm({ ...regionForm, code: e.target.value })} required placeholder="WEST" /></label>
                <label>Name<input value={regionForm.name} onChange={(e) => setRegionForm({ ...regionForm, name: e.target.value })} required placeholder="Western Uganda" /></label>
                <button className="setup-primary" disabled={!!action}>{action === 'Create region' ? 'Creating…' : 'Create region'}</button>
              </form>
              <form className="setup-form-grid" onSubmit={submitTeam}>
                <div><strong>Team</strong><p className="muted">Manager-scoped team creation.</p></div>
                <label>Region<select value={teamForm.regionId} onChange={(e) => setTeamForm({ ...teamForm, regionId: e.target.value })} required><option value="">Select</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}</select></label>
                <label>Manager<select value={teamForm.managerUserId} onChange={(e) => setTeamForm({ ...teamForm, managerUserId: e.target.value })} required><option value="">Select</option>{managers.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}</select></label>
                <label>Team code<input value={teamForm.teamCode} onChange={(e) => setTeamForm({ ...teamForm, teamCode: e.target.value })} required placeholder="CEN-01" /></label>
                <label>Team name<input value={teamForm.teamName} onChange={(e) => setTeamForm({ ...teamForm, teamName: e.target.value })} required placeholder="Central Team 01" /></label>
                <button className="setup-primary" disabled={!!action}>{action === 'Create team' ? 'Creating…' : 'Create team'}</button>
              </form>
            </div>
            <div className="grid two">
              <form className="setup-form-grid" onSubmit={submitShop}>
                <div><strong>Shop Owner location</strong><p className="muted">Create a shop scope inside an authorized team.</p></div>
                <label>Team<select value={shopForm.teamId} onChange={(e) => setShopForm({ ...shopForm, teamId: e.target.value })} required><option value="">Select</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                <label>Shop code<input value={shopForm.shopCode} onChange={(e) => setShopForm({ ...shopForm, shopCode: e.target.value })} required placeholder="KLA-001" /></label>
                <label>Shop name<input value={shopForm.shopName} onChange={(e) => setShopForm({ ...shopForm, shopName: e.target.value })} required placeholder="Amaal Partner Shop" /></label>
                <label>Location<input value={shopForm.location} onChange={(e) => setShopForm({ ...shopForm, location: e.target.value })} placeholder="Kampala Road" /></label>
                <button className="setup-primary" disabled={!!action}>{action === 'Create shop' ? 'Creating…' : 'Create shop'}</button>
              </form>
              <form className="setup-form-grid" onSubmit={submitPerson}>
                <div><strong>Provision identity</strong><p className="muted">Links an existing Neon Auth user to the Amaal hierarchy.</p></div>
                <label>Neon Auth user ID<input value={personForm.userId} onChange={(e) => setPersonForm({ ...personForm, userId: e.target.value })} required placeholder="UUID" /></label>
                <label>Display name<input value={personForm.displayName} onChange={(e) => setPersonForm({ ...personForm, displayName: e.target.value })} required /></label>
                <label>Role<select value={personForm.role} onChange={(e) => setPersonForm({ ...personForm, role: e.target.value })}>{['REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER'].map((r) => <option key={r} value={r}>{r.replace('_',' ')}</option>)}</select></label>
                <label>Employee number<input value={personForm.employeeNumber} onChange={(e) => setPersonForm({ ...personForm, employeeNumber: e.target.value })} /></label>
                <label>Region<select value={personForm.regionId} onChange={(e) => setPersonForm({ ...personForm, regionId: e.target.value })}><option value="">—</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}</select></label>
                <label>Manager user ID<input value={personForm.managerUserId} onChange={(e) => setPersonForm({ ...personForm, managerUserId: e.target.value })} /></label>
                <label>Team<select value={personForm.teamId} onChange={(e) => setPersonForm({ ...personForm, teamId: e.target.value })}><option value="">—</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                <label>Shop ID<input value={personForm.shopId} onChange={(e) => setPersonForm({ ...personForm, shopId: e.target.value })} /></label>
                <button className="setup-primary" disabled={!!action}>{action === 'Provision identity' ? 'Provisioning…' : 'Provision identity'}</button>
              </form>
            </div>
          </section>
          <section className="card emphasis"><div className="card-label">2B CONTROL PLANE</div><blockquote>No identity gets a role without an organizational scope.</blockquote><p className="muted">Managers inherit their teams, Team Leaders inherit their team, and seller access is restricted to the team/shop records assigned to them.</p></section>
        </section>
      </div>
    </main>
  );
}
