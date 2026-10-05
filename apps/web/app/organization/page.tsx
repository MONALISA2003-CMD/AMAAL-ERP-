'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getSetupStatus, type AmaalSetupStatus } from '../../lib/api';
import { adminProfileLabel, roleLabel } from '../../lib/display';
import { authClient } from '../../lib/auth';
import { BrandLogo } from '../../components/brand-logo';

type Me = {
  user: { id: string; email: string | null };
  accessState: 'ACTIVE' | 'PENDING_ASSIGNMENT' | 'SUSPENDED';
  authorization: { roles: string[]; permissions: string[]; regionIds: string[]; teamIds: string[]; shopIds: string[] };
  mfaRequired: boolean;
  mfaVerified: boolean;
};

type Person = {
  userId: string;
  email: string | null;
  displayName: string;
  employeeNumber: string | null;
  phone: string | null;
  profileStatus: string;
  role: string;
  regionId: string | null;
  subregionId: string | null;
  subregionCode: string | null;
  subregionName: string | null;
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

const roleOrder = ['ADMIN','REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER','RECOVERY_OFFICER'];

export default function OrganizationPage() {
  const router = useRouter();
  const [people, setPeople] = useState<Person[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<AmaalSetupStatus | null>(null);
  const [action, setAction] = useState('');
  const [actionError, setActionError] = useState('');
  const [regionForm, setRegionForm] = useState({ code: '', name: '' });
  const [subregionForm, setSubregionForm] = useState({ regionId: '', code: '', name: '' });
  const [teamForm, setTeamForm] = useState({ regionId: '', managerUserId: '', subregionId: '', teamCode: '', teamName: '' });
  const [shopForm, setShopForm] = useState({ teamId: '', shopCode: '', shopName: '', location: '' });
  const [personForm, setPersonForm] = useState({ userId: '', displayName: '', employeeNumber: '', phone: '', role: 'AGENT', regionId: '', regionalManagerUserId: '', subregionId: '', managerUserId: '', teamId: '', shopId: '' });
  const [inviteForm, setInviteForm] = useState({ email: '', displayName: '', employeeNumber: '', phone: '', role: 'AGENT', regionId: '', regionalManagerUserId: '', subregionId: '', managerUserId: '', teamId: '', shopId: '' });
  const [inviteLink, setInviteLink] = useState('');
  const [adminForm, setAdminForm] = useState({ userId: '', displayName: '', employeeNumber: '', phone: '', profileKey: 'USER_ADMIN' });
  const [adminInviteForm, setAdminInviteForm] = useState({ email: '', displayName: '', employeeNumber: '', phone: '', profileKey: 'USER_ADMIN' });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await authClient.getSession();
        if (!session?.data) { router.replace('/login'); return; }
        const [identity, setupStatus, payload] = await Promise.all([apiFetch<Me>('/v1/me'), getSetupStatus(), apiFetch<{ items: Person[] }>('/v1/org/directory')]);
        if (active) setMe(identity);
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

  const actorRoles = me?.authorization.roles ?? [];
  const isCeo = actorRoles.includes('CEO');
  const isAdmin = actorRoles.includes('ADMIN');
  const recruitableRoles = useMemo(() => {
    if (isCeo) return [];
    if (isAdmin) return ['REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER'];
    if (actorRoles.includes('REGIONAL_MANAGER')) return ['MANAGER','RECOVERY_OFFICER'];
    if (actorRoles.includes('MANAGER')) return ['TEAM_LEADER'];
    if (actorRoles.includes('TEAM_LEADER')) return ['AGENT','SHOP_OWNER'];
    return [];
  }, [actorRoles, isAdmin, isCeo]);

  useEffect(() => {
    const first = recruitableRoles[0];
    if (!first) return;
    setInviteForm((current) => current.role && recruitableRoles.includes(current.role) ? current : { ...current, role: first });
    setPersonForm((current) => current.role && recruitableRoles.includes(current.role) ? current : { ...current, role: first });
  }, [recruitableRoles]);

  const regions = useMemo(() => {
    const map = new Map<string, { id: string; code: string; name: string }>();
    for (const r of setup?.regions ?? []) map.set(r.id, r);
    for (const p of people) if (p.regionId && !map.has(p.regionId)) map.set(p.regionId, { id: p.regionId, code: p.regionCode ?? '—', name: p.regionName ?? p.regionId });
    return [...map.values()];
  }, [setup, people]);
  const managers = useMemo(() => people.filter((p) => p.role === 'MANAGER'), [people]);
  const regionalManagers = useMemo(() => people.filter((p) => p.role === 'REGIONAL_MANAGER'), [people]);
  const subregions = useMemo(() => people.length ? people.filter((p) => p.subregionId).map((p) => ({ id: p.subregionId!, code: p.subregionCode ?? p.subregionId!, name: p.subregionName ?? p.subregionId! })).filter((r, i, a) => a.findIndex((x) => x.id === r.id) === i) : [], [people]);
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
  async function submitSubregion(e: React.FormEvent) {
    e.preventDefault();
    if (await runAction('Create sub-region', '/v1/org/subregions', subregionForm)) setSubregionForm({ regionId: '', code: '', name: '' });
  }
  async function submitTeam(e: React.FormEvent) {
    e.preventDefault();
    if (await runAction('Create team', '/v1/org/teams', teamForm)) setTeamForm({ regionId: '', managerUserId: '', subregionId: '', teamCode: '', teamName: '' });
  }
  async function submitShop(e: React.FormEvent) {
    e.preventDefault();
    if (await runAction('Create shop', '/v1/org/shops', shopForm)) setShopForm({ teamId: '', shopCode: '', shopName: '', location: '' });
  }
  async function submitPerson(e: React.FormEvent) {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(personForm).map(([k, v]) => [k, v || undefined]));
    if (await runAction('Add staff member', '/v1/org/people', body)) setPersonForm({ userId: '', displayName: '', employeeNumber: '', phone: '', role: 'AGENT', regionId: '', regionalManagerUserId: '', subregionId: '', managerUserId: '', teamId: '', shopId: '' });
  }
  async function submitInvitation(e: React.FormEvent) {
    e.preventDefault();
    setAction('Create invitation'); setActionError(''); setInviteLink('');
    try {
      const result = await apiFetch<{ inviteUrl: string }>('/v1/org/invitations', { method:'POST', body: JSON.stringify(Object.fromEntries(Object.entries(inviteForm).map(([k,v])=>[k,v||undefined]))) });
      setInviteLink(result.inviteUrl);
      setActionError('Invitation created. Share the secure link with the recruit.');
      setInviteForm({ email:'',displayName:'',employeeNumber:'',phone:'',role:'AGENT',regionId:'',regionalManagerUserId:'',subregionId:'',managerUserId:'',teamId:'',shopId:'' });
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Unable to create invitation.'); } finally { setAction(''); }
  }

  async function submitAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (await runAction('Provision admin', '/v1/org/admins', adminForm)) setAdminForm({ userId:'',displayName:'',employeeNumber:'',phone:'',profileKey:'USER_ADMIN' });
  }

  async function submitAdminInvitation(e: React.FormEvent) {
    e.preventDefault();
    setAction('Create Admin invitation'); setActionError(''); setInviteLink('');
    try {
      const result = await apiFetch<{ inviteUrl: string }>('/v1/org/admin-invitations', { method:'POST', body: JSON.stringify(adminInviteForm) });
      setInviteLink(result.inviteUrl);
      setActionError('Admin invitation created. Share the secure link with the recruit.');
      setAdminInviteForm({ email:'',displayName:'',employeeNumber:'',phone:'',profileKey:'USER_ADMIN' });
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Unable to create Admin invitation.'); } finally { setAction(''); }
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
          <a className="nav-item" href="/dashboard#inventory">Inventory & Devices</a>
          <a className="nav-item" href="/dashboard#sales">Sales & Receipts</a>
          <a className="nav-item" href="/dashboard#recovery">Recovery</a>
          <div className="section-label lower">INTELLIGENCE</div>
          <a className="nav-item" href="/ai">Amaal AI</a>
        </aside>
        <section className="content">
          <div className="content-header">
            <div><div className="eyebrow">PEOPLE & STRUCTURE</div><h1>Your organization</h1><p className="muted">See the people, teams and locations you manage in one place.</p></div>
            <div className="status-pill ready">In your area</div>
          </div>
          {error ? <div className="alert-card">{error}</div> : null}
          <div className="grid three">
            {roleOrder.map((role) => <section className="card module" key={role}><div className="module-icon">{counts[role] ?? 0}</div><h3>{roleLabel(role)}</h3><p>Active people in your area.</p><span>In your area</span></section>)}
          </div>
          <section className="card">
            <div className="card-label">HIERARCHY</div>
            {loading ? <p className="muted">Loading organizational structure…</p> : grouped.length === 0 ? <p className="muted">No staff members have been added below this level yet.</p> : grouped.map((region) => (
              <div className="roadmap" key={region.code+region.name}>
                <div className="roadmap-item current"><span>REGION</span><div><strong>{region.name}</strong><p>{region.code}</p></div></div>
                {[...region.managers.entries()].map(([managerKey, manager]) => <div className="roadmap-item" key={managerKey}><span>MANAGER</span><div><strong>{manager.name}</strong><p>{manager.teams.size} team(s)</p>
                  {[...manager.teams.entries()].map(([teamKey, team]) => <div className="scope-grid" key={teamKey}><div><span>{team.name}</span><strong>{team.people.length}</strong></div><div><span>Team Leader</span><strong>{team.people.filter((p) => p.role === 'TEAM_LEADER').length}</strong></div><div><span>Agents</span><strong>{team.people.filter((p) => p.role === 'AGENT').length}</strong></div><div><span>Shop Owners</span><strong>{team.people.filter((p) => p.role === 'SHOP_OWNER').length}</strong></div></div>)}
                </div></div>)}
              </div>
            ))}
          </section>
          <section className="card">
            <div className="card-label">ACCESS MANAGEMENT</div>
            <p className="muted">Organization changes and new staff access follow Amaal’s approval rules. The CEO creates Administrators, and Administrators can add the staff roles they manage.</p>
            {actionError ? <div className="alert-card">{actionError}</div> : null}
            {inviteLink ? <div className="card emphasis"><div className="card-label">INVITATION LINK</div><code>{inviteLink}</code><p className="muted">Share this link with the invited person through your approved Amaal communication channel.</p></div> : null}

            <div className="grid two">
              <form className="setup-form-grid" onSubmit={submitRegion}>
                <div><strong>Main region</strong><p className="muted">Manage the main region.</p></div>
                <label>Code<input value={regionForm.code} onChange={(e) => setRegionForm({ ...regionForm, code: e.target.value })} required placeholder="WEST" /></label>
                <label>Name<input value={regionForm.name} onChange={(e) => setRegionForm({ ...regionForm, name: e.target.value })} required placeholder="Western Uganda" /></label>
                <button className="setup-primary" disabled={!!action}>{action === 'Create region' ? 'Creating…' : 'Create region'}</button>
              </form>
              <form className="setup-form-grid" onSubmit={submitSubregion}>
                <div><strong>Sub-region</strong><p className="muted">Add a named area within a region.</p></div>
                <label>Region<select value={subregionForm.regionId} onChange={(e) => setSubregionForm({ ...subregionForm, regionId: e.target.value })} required><option value="">Select</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}</select></label>
                <label>Code<input value={subregionForm.code} onChange={(e) => setSubregionForm({ ...subregionForm, code: e.target.value })} required placeholder="N-W1" /></label>
                <label>Name<input value={subregionForm.name} onChange={(e) => setSubregionForm({ ...subregionForm, name: e.target.value })} required placeholder="Northern Zone 1" /></label>
                <button className="setup-primary" disabled={!!action}>{action === 'Create sub-region' ? 'Creating…' : 'Create sub-region'}</button>
              </form>
            </div>

            <div className="grid two">
              <form className="setup-form-grid" onSubmit={submitTeam}>
                <div><strong>Team</strong><p className="muted">Create a team for a manager.</p></div>
                <label>Region<select value={teamForm.regionId} onChange={(e) => setTeamForm({ ...teamForm, regionId: e.target.value })} required><option value="">Select</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}</select></label>
                <label>Manager<select value={teamForm.managerUserId} onChange={(e) => setTeamForm({ ...teamForm, managerUserId: e.target.value })} required><option value="">Select</option>{managers.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}</select></label>
                <label>Sub-region<select value={teamForm.subregionId} onChange={(e) => setTeamForm({ ...teamForm, subregionId: e.target.value })}><option value="">—</option>{subregions.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}</select></label>
                <label>Team code<input value={teamForm.teamCode} onChange={(e) => setTeamForm({ ...teamForm, teamCode: e.target.value })} required placeholder="CEN-01" /></label>
                <label>Team name<input value={teamForm.teamName} onChange={(e) => setTeamForm({ ...teamForm, teamName: e.target.value })} required placeholder="Central Team 01" /></label>
                <button className="setup-primary" disabled={!!action}>{action === 'Create team' ? 'Creating…' : 'Create team'}</button>
              </form>
              <form className="setup-form-grid" onSubmit={submitShop}>
                <div><strong>Shop Owner location</strong><p className="muted">Create a shop within the selected team.</p></div>
                <label>Team<select value={shopForm.teamId} onChange={(e) => setShopForm({ ...shopForm, teamId: e.target.value })} required><option value="">Select</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                <label>Shop code<input value={shopForm.shopCode} onChange={(e) => setShopForm({ ...shopForm, shopCode: e.target.value })} required placeholder="KLA-001" /></label>
                <label>Shop name<input value={shopForm.shopName} onChange={(e) => setShopForm({ ...shopForm, shopName: e.target.value })} required placeholder="Amaal Partner Shop" /></label>
                <label>Location<input value={shopForm.location} onChange={(e) => setShopForm({ ...shopForm, location: e.target.value })} placeholder="Kampala Road" /></label>
                <button className="setup-primary" disabled={!!action}>{action === 'Create shop' ? 'Creating…' : 'Create shop'}</button>
              </form>
            </div>

            <div className="grid two">
              {recruitableRoles.length ? <form className="setup-form-grid" onSubmit={submitInvitation}>
                <div><strong>Recruit / invite</strong><p className="muted">Preferred path. CEO creates Admins. Admins recruit Regional Managers, Managers, Team Leaders, Agents and Shop Owners. Recovery Officers are recruited by Regional Managers.</p></div>
                <label>Email<input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} required /></label>
                <label>Display name<input value={inviteForm.displayName} onChange={(e) => setInviteForm({ ...inviteForm, displayName: e.target.value })} required /></label>
                <label>Role<select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}>{recruitableRoles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></label>
                <label>Region<select value={inviteForm.regionId} onChange={(e) => setInviteForm({ ...inviteForm, regionId: e.target.value })}><option value="">—</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}</select></label>
                <label>Sub-region<select value={inviteForm.subregionId} onChange={(e) => setInviteForm({ ...inviteForm, subregionId: e.target.value })}><option value="">—</option>{subregions.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}</select></label>
                {inviteForm.role === 'MANAGER' ? <label>Regional Manager<select value={inviteForm.regionalManagerUserId} onChange={(e) => setInviteForm({ ...inviteForm, regionalManagerUserId: e.target.value })}><option value="">Select RM</option>{regionalManagers.map((rm) => <option key={rm.userId} value={rm.userId}>{rm.displayName}{rm.regionCode ? ` — ${rm.regionCode}` : ''}</option>)}</select></label> : null}
                {['TEAM_LEADER','AGENT','SHOP_OWNER'].includes(inviteForm.role) ? <label>Manager account<input value={inviteForm.managerUserId} onChange={(e) => setInviteForm({ ...inviteForm, managerUserId: e.target.value })} placeholder="Manager UUID" /></label> : null}
                <label>Team<select value={inviteForm.teamId} onChange={(e) => setInviteForm({ ...inviteForm, teamId: e.target.value })}><option value="">—</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                <label>Shop account<input value={inviteForm.shopId} onChange={(e) => setInviteForm({ ...inviteForm, shopId: e.target.value })} placeholder="Shop Owner only" /></label>
                <button className="setup-primary" disabled={!!action}>{action === 'Create invitation' ? 'Creating…' : 'Create secure invite'}</button>
              </form> : <div className="card"><div className="card-label">RECRUITMENT</div><h3>No recruitment roles available</h3><p className="muted">Your current role does not have authority to create organizational logins from this workspace.</p></div>}
              {isCeo ? <form className="setup-form-grid" onSubmit={submitAdmin}>
                <div><strong>Provision Admin</strong><p className="muted">CEO-only. Admin authority is profile-based, not automatically CEO-level.</p></div>
                <label>Account reference<input value={adminForm.userId} onChange={(e) => setAdminForm({ ...adminForm, userId: e.target.value })} required placeholder="UUID" /></label>
                <label>Display name<input value={adminForm.displayName} onChange={(e) => setAdminForm({ ...adminForm, displayName: e.target.value })} required /></label>
                <label>Employee number<input value={adminForm.employeeNumber} onChange={(e) => setAdminForm({ ...adminForm, employeeNumber: e.target.value })} /></label>
                <label>Admin profile<select value={adminForm.profileKey} onChange={(e) => setAdminForm({ ...adminForm, profileKey: e.target.value })}>{['SYSTEM_ADMIN','USER_ADMIN','INVENTORY_ADMIN','FINANCE_ADMIN','REPORTING_ADMIN','OPERATIONS_ADMIN','AUDIT_ADMIN'].map((r) => <option key={r} value={r}>{adminProfileLabel(r)}</option>)}</select></label>
                <button className="setup-primary" disabled={!!action}>{action === 'Provision admin' ? 'Adding…' : 'Provision Admin'}</button>
              </form> : null}
              {isCeo ? <form className="setup-form-grid" onSubmit={submitAdminInvitation}>
                <div><strong>Recruit Admin</strong><p className="muted">CEO-only controlled recruitment. The person creates their Amaal account from the secure invitation.</p></div>
                <label>Email<input type="email" value={adminInviteForm.email} onChange={(e) => setAdminInviteForm({ ...adminInviteForm, email: e.target.value })} required /></label>
                <label>Display name<input value={adminInviteForm.displayName} onChange={(e) => setAdminInviteForm({ ...adminInviteForm, displayName: e.target.value })} required /></label>
                <label>Employee number<input value={adminInviteForm.employeeNumber} onChange={(e) => setAdminInviteForm({ ...adminInviteForm, employeeNumber: e.target.value })} /></label>
                <label>Admin profile<select value={adminInviteForm.profileKey} onChange={(e) => setAdminInviteForm({ ...adminInviteForm, profileKey: e.target.value })}>{['SYSTEM_ADMIN','USER_ADMIN','INVENTORY_ADMIN','FINANCE_ADMIN','REPORTING_ADMIN','OPERATIONS_ADMIN','AUDIT_ADMIN'].map((r) => <option key={r} value={r}>{adminProfileLabel(r)}</option>)}</select></label>
                <button className="setup-primary" disabled={!!action}>{action === 'Create Admin invitation' ? 'Creating…' : 'Create Admin invite'}</button>
              </form> : null}
            </div>

            <div className="grid two">
              <form className="setup-form-grid" onSubmit={submitPerson}>
                <div><strong>Link existing account</strong><p className="muted">Use this when the person already has an Amaal account.</p></div>
                <label>Account reference<input value={personForm.userId} onChange={(e) => setPersonForm({ ...personForm, userId: e.target.value })} required placeholder="UUID" /></label>
                <label>Display name<input value={personForm.displayName} onChange={(e) => setPersonForm({ ...personForm, displayName: e.target.value })} required /></label>
                <label>Role<select value={personForm.role} onChange={(e) => setPersonForm({ ...personForm, role: e.target.value })}>{recruitableRoles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></label>
                <label>Region<select value={personForm.regionId} onChange={(e) => setPersonForm({ ...personForm, regionId: e.target.value })}><option value="">—</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}</select></label>
                <label>Sub-region<select value={personForm.subregionId} onChange={(e) => setPersonForm({ ...personForm, subregionId: e.target.value })}><option value="">—</option>{subregions.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}</select></label>
                <label>Regional Manager account<input value={personForm.regionalManagerUserId} onChange={(e) => setPersonForm({ ...personForm, regionalManagerUserId: e.target.value })} /></label>
                <label>Manager account<input value={personForm.managerUserId} onChange={(e) => setPersonForm({ ...personForm, managerUserId: e.target.value })} /></label>
                <label>Team<select value={personForm.teamId} onChange={(e) => setPersonForm({ ...personForm, teamId: e.target.value })}><option value="">—</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                <label>Shop account<input value={personForm.shopId} onChange={(e) => setPersonForm({ ...personForm, shopId: e.target.value })} /></label>
                <button className="setup-primary" disabled={!!action}>{action === 'Add staff member' ? 'Adding…' : 'Link existing account'}</button>
              </form>
            </div>
          </section>
          <section className="card emphasis"><div className="card-label">ACCESS MANAGEMENT</div><blockquote>Every person must have a clear role and place in the organization.</blockquote><p className="muted">Managers inherit their teams, Team Leaders inherit their team, and seller access is restricted to the team/shop records assigned to them.</p></section>
        </section>
      </div>
    </main>
  );
}
