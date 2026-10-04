'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import { authClient, clearMfaAssertion } from '../../lib/auth';
import { BrandLogo } from '../../components/brand-logo';

type Me = {
  user: { id: string; email: string | null };
  accessState: 'ACTIVE' | 'PENDING_ASSIGNMENT' | 'SUSPENDED';
  authorization: { roles: string[]; permissions: string[]; regionIds: string[]; teamIds: string[]; shopIds: string[] };
  mfaRequired: boolean;
  mfaVerified: boolean;
};

type InventorySummary = { total: number; states: Record<string, number>; aging: Record<string, number> };
type Warehouse = { id: string; code: string; name: string; type: string; regionId: string | null; regionName: string | null };
type Variant = { id: string; sku: string; ram: string | null; storage: string | null; color: string | null; network: string | null; status: string };
type Brand = { id: string; brandName: string; status: string; createdAt: string };
type Product = { id: string; modelName: string; category: string | null; brandId: string; brandName: string; variants: Variant[] };
type Imei = { imei_id: string; imei: string; imei2: string | null; serialNumber: string | null; brandName: string; modelName: string; sku: string; state: string; conditionStatus: string; holderUserId?: string | null; holderName: string | null; warehouseName: string | null; regionName: string | null; teamName: string | null; shopName: string | null; agingStatus: string | null; daysRemaining: number | null; updatedAt: string };
type Allocation = { allocationId: string; status: string; requestedAt: string; approvedAt: string | null; receivedAt: string | null; imeiCount: number; };
type ReconciliationRun = { reconciliationId: string; scopeType: string; scopeId: string; status: string; startedAt: string; finalizedAt: string | null; expectedCount: number; foundCount: number; missingCount: number; unexpectedCount: number; wrongHolderCount: number; wrongRegionCount: number; wrongWarehouseCount: number; wrongConditionCount: number; };
type Movement = { id: string; movementType: string; fromHolderUserId: string | null; toHolderUserId: string | null; fromWarehouseId: string | null; toWarehouseId: string | null; fromTeamId: string | null; toTeamId: string | null; fromShopId: string | null; toShopId: string | null; reason: string | null; notes: string | null; conditionBefore: string | null; conditionAfter: string | null; requestedAt: string; approvedAt: string | null; acceptedAt: string | null; createdAt: string };

const stateLabels: Record<string, string> = {
  MASTER_WAREHOUSE: 'Master warehouse', REGIONAL_WAREHOUSE: 'Regional warehouse', ALLOCATED_TO_MANAGER: 'Manager',
  ALLOCATED_TO_TEAM: 'Team', ALLOCATED_TO_AGENT: 'Agent', ALLOCATED_TO_SHOP: 'Shop', SOLD: 'Sold',
  RETURNED: 'Returned', RECOVERY_PENDING: 'Recovery', RECOVERED: 'Recovered', DAMAGED: 'Damaged', LOST: 'Lost',
  QUARANTINE: 'Quarantine', TRANSFER_PENDING: 'Transfer pending', RECEIVED: 'Received',
};

function prettyState(state: string) { return stateLabels[state] ?? state.replaceAll('_', ' '); }

export default function InventoryPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [imeis, setImeis] = useState<Imei[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [reconciliations, setReconciliations] = useState<ReconciliationRun[]>([]);
  const [movementHistory, setMovementHistory] = useState<{ imeiId: string; imei: string; items: Movement[] } | null>(null);
  const [reconcile, setReconcile] = useState({ warehouseId: '', scannedText: '', notes: '' });
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [brandName, setBrandName] = useState('');
  const [productForm, setProductForm] = useState({ brandId: '', modelName: '', category: '' });
  const [variantForm, setVariantForm] = useState({ productId: '', sku: '', ram: '', storage: '', color: '', network: '' });
  const [receipt, setReceipt] = useState({ warehouseId: '', purchaseReference: '', conditionStatus: 'NEW', unitsText: '' });

  const canCreateProducts = !!me?.authorization.permissions.includes('products.create');
  const canEditProducts = !!me?.authorization.permissions.includes('products.edit');
  const canArchiveProducts = !!me?.authorization.permissions.includes('products.archive');
  const canReceive = !!me?.authorization.permissions.includes('inventory.transfer');
  const canReconcile = !!me?.authorization.permissions.includes('inventory.reconcile');

  async function loadAll(query = q, selectedState = state) {
    setError('');
    const [identity, nextSummary, nextWarehouses, nextBrands, nextProducts, nextImeis, nextAllocations, nextReconciliations] = await Promise.all([
      apiFetch<Me>('/v1/me'),
      apiFetch<InventorySummary>('/v1/inventory/summary'),
      apiFetch<{ items: Warehouse[] }>('/v1/inventory/warehouses'),
      apiFetch<{ items: Brand[] }>('/v1/catalog/brands'),
      apiFetch<{ items: Product[] }>('/v1/catalog/products?q='),
      apiFetch<{ items: Imei[] }>(`/v1/inventory/imeis?q=${encodeURIComponent(query)}${selectedState ? `&state=${encodeURIComponent(selectedState)}` : ''}`),
      apiFetch<{ items: Allocation[] }>('/v1/inventory/allocations'),
      apiFetch<{ items: ReconciliationRun[] }>('/v1/inventory/reconciliations'),
    ]);
    if (identity.accessState !== 'ACTIVE') {
      router.replace(identity.accessState === 'SUSPENDED' ? '/access-pending?state=suspended' : '/access-pending');
      return;
    }
    if (identity.mfaRequired && !identity.mfaVerified) { router.replace('/mfa'); return; }
    setMe(identity); setSummary(nextSummary); setWarehouses(nextWarehouses.items); setBrands(nextBrands.items); setProducts(nextProducts.items); setImeis(nextImeis.items); setAllocations(nextAllocations.items); setReconciliations(nextReconciliations.items);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try { await loadAll(); } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load inventory workspace.'); }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function signOut() { clearMfaAssertion(); await authClient.signOut(); router.replace('/login'); }

  async function submitMutation(label: string, action: () => Promise<unknown>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(`${label} completed.`); await loadAll(); }
    catch (e) { setError(e instanceof Error ? e.message : `${label} failed.`); }
    finally { setBusy(false); }
  }

  async function createBrand(e: React.FormEvent) {
    e.preventDefault(); if (!brandName.trim()) return;
    await submitMutation('Brand creation', () => apiFetch('/v1/catalog/brands', { method: 'POST', headers: { 'x-idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ name: brandName }) }));
    setBrandName('');
  }
  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    await submitMutation('Product creation', () => apiFetch('/v1/catalog/products', { method: 'POST', headers: { 'x-idempotency-key': crypto.randomUUID() }, body: JSON.stringify(productForm) }));
    setProductForm({ brandId: '', modelName: '', category: '' });
  }
  async function createVariant(e: React.FormEvent) {
    e.preventDefault();
    await submitMutation('Variant creation', () => apiFetch('/v1/catalog/variants', { method: 'POST', headers: { 'x-idempotency-key': crypto.randomUUID() }, body: JSON.stringify(variantForm) }));
    setVariantForm({ productId: '', sku: '', ram: '', storage: '', color: '', network: '' });
  }

  async function editBrand(brand: Brand) {
    if (!canEditProducts) return;
    const name = window.prompt('Edit brand name', brand.brandName);
    if (!name || name.trim() === brand.brandName) return;
    await submitMutation('Brand update', () => apiFetch(`/v1/catalog/brands/${brand.id}/update`, { method:'POST', headers:{'x-idempotency-key':crypto.randomUUID()}, body:JSON.stringify({name:name.trim()}) }));
  }
  async function editProduct(product: Product) {
    if (!canEditProducts) return;
    const modelName = window.prompt('Edit product model', product.modelName);
    if (!modelName || !modelName.trim()) return;
    const category = window.prompt('Edit category', product.category ?? '') ?? '';
    await submitMutation('Product update', () => apiFetch(`/v1/catalog/products/${product.id}/update`, { method:'POST', headers:{'x-idempotency-key':crypto.randomUUID()}, body:JSON.stringify({modelName:modelName.trim(),category:category.trim() || undefined}) }));
  }
  async function editVariant(variant: Variant) {
    if (!canEditProducts) return;
    const sku = window.prompt('Edit SKU', variant.sku);
    if (!sku || !sku.trim()) return;
    await submitMutation('Variant update', () => apiFetch(`/v1/catalog/variants/${variant.id}/update`, { method:'POST', headers:{'x-idempotency-key':crypto.randomUUID()}, body:JSON.stringify({sku:sku.trim(),ram:variant.ram||undefined,storage:variant.storage||undefined,color:variant.color||undefined,network:variant.network||undefined}) }));
  }
  async function archiveCatalogResource(resource: 'brands'|'products'|'variants', id: string, label: string) {
    if (!canArchiveProducts || !window.confirm(`Archive this ${label}? Historical inventory and audit records will remain.`)) return;
    await submitMutation(`${label} archive`, () => apiFetch(`/v1/catalog/${resource}/${id}/archive`, { method:'POST', headers:{'x-idempotency-key':crypto.randomUUID()}, body:'{}' }));
  }
  async function showMovementHistory(item: Imei) {
    setBusy(true); setError('');
    try {
      const result = await apiFetch<{ items: Movement[] }>(`/v1/inventory/imeis/${item.imei_id}/movements?limit=100`);
      setMovementHistory({ imeiId:item.imei_id, imei:item.imei, items:result.items });
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load IMEI movement history.'); }
    finally { setBusy(false); }
  }

  async function receiveStock(e: React.FormEvent) {
    e.preventDefault();
    const units = receipt.unitsText.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const [productVariantId, imei, imei2, serialNumber] = line.split(',').map((part) => part.trim());
      return { productVariantId, imei, imei2: imei2 || undefined, serialNumber: serialNumber || undefined };
    });
    if (!receipt.warehouseId || !units.length || units.some((u) => !u.productVariantId || !u.imei)) { setError('Receipt lines must be: productVariantId, IMEI, optional IMEI2, optional serial number.'); return; }
    await submitMutation('Inventory receipt', () => apiFetch('/v1/inventory/receipts', { method: 'POST', headers: { 'x-idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ warehouseId: receipt.warehouseId, purchaseReference: receipt.purchaseReference || undefined, conditionStatus: receipt.conditionStatus, units }) }));
    setReceipt({ warehouseId: '', purchaseReference: '', conditionStatus: 'NEW', unitsText: '' });
  }

  const stateOptions = useMemo(() => Object.keys(summary?.states ?? {}).sort(), [summary]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-brand"><BrandLogo variant="full" className="topbar-full-logo" priority /><div className="topbar-subtitle">Inventory</div></div>
        <button className="ghost-button" onClick={signOut}>Sign out</button>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="section-label">OPERATIONS</div>
          <nav>
            <a className="nav-item" href="/dashboard">Command Center</a>
            <a className="nav-item" href="/organization">People & Structure</a>
            <a className="nav-item active" href="/inventory">Inventory & IMEI</a>
            <a className="nav-item" href="#sales">Sales & Receipts</a>
            <a className="nav-item" href="#recovery">Recovery</a>
            <a className="nav-item" href="#approvals">Approvals</a>
            <a className="nav-item" href="#reports">Reports</a>
          </nav>
          <div className="section-label lower">INTELLIGENCE</div>
          <a className="nav-item" href="/ai">Amaal AI</a>
        </aside>
        <section className="content">
          <div className="content-header">
            <div><div className="eyebrow">PHASE 3 · INVENTORY CUSTODY</div><h1>Products, IMEI registry and stock custody.</h1><p className="muted">One physical device equals one accountable IMEI record. Every movement is recorded and scoped.</p></div>
          </div>
          {error ? <div className="alert-card">{error}</div> : null}
          {notice ? <div className="notice-card">{notice}</div> : null}

          <div className="grid four">
            <section className="card metric-card"><div className="card-label">TOTAL UNITS</div><strong>{summary?.total ?? '—'}</strong><span>Scoped IMEI registry</span></section>
            <section className="card metric-card"><div className="card-label">WAREHOUSE</div><strong>{(summary?.states?.MASTER_WAREHOUSE ?? 0) + (summary?.states?.REGIONAL_WAREHOUSE ?? 0)}</strong><span>Units in warehouses</span></section>
            <section className="card metric-card"><div className="card-label">FIELD CUSTODY</div><strong>{['ALLOCATED_TO_MANAGER','ALLOCATED_TO_TEAM','ALLOCATED_TO_AGENT','ALLOCATED_TO_SHOP'].reduce((n,k)=>n+(summary?.states?.[k]??0),0)}</strong><span>Accountable outside warehouse</span></section>
            <section className="card metric-card"><div className="card-label">AGED</div><strong>{(summary?.aging?.RED ?? 0) + (summary?.aging?.DARK_RED ?? 0)}</strong><span>Red and dark-red exposure</span></section>
          </div>

          <section className="card">
            <div className="content-header compact"><div><div className="card-label">IMEI REGISTRY</div><h2>Current custody</h2></div><div className="chip-row">{Object.entries(summary?.aging ?? {}).map(([key,value]) => <span className="chip" key={key}>{key}: {value}</span>)}</div></div>
            <div className="grid two"><label>Search<input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="IMEI, IMEI2, serial, SKU or model" /></label><label>State<select value={state} onChange={(e)=>setState(e.target.value)}><option value="">All states</option>{stateOptions.map((item)=><option key={item} value={item}>{prettyState(item)}</option>)}</select></label></div>
            <div className="button-row"><button className="setup-primary" disabled={busy} onClick={()=>void loadAll(q,state)}>Search inventory</button></div>
            <div className="table-wrap"><table><thead><tr><th>IMEI</th><th>Product</th><th>SKU</th><th>State</th><th>Holder</th><th>Team / Shop</th><th>Region / Warehouse</th><th>Aging</th><th>Trace</th></tr></thead><tbody>
              {imeis.map((item)=><tr key={item.imei_id}><td><strong>{item.imei}</strong><small>{item.serialNumber ?? item.imei2 ?? ''}</small></td><td>{item.brandName} {item.modelName}</td><td>{item.sku}</td><td>{prettyState(item.state)}</td><td>{item.holderName ?? '—'}</td><td>{item.shopName ?? item.teamName ?? '—'}</td><td>{item.warehouseName ?? item.regionName ?? '—'}</td><td>{item.agingStatus ? `${item.agingStatus}${item.daysRemaining !== null ? ` · ${item.daysRemaining}d` : ''}` : '—'}</td><td><button className="setup-secondary" disabled={busy} onClick={()=>void showMovementHistory(item)}>History</button></td></tr>)}
              {!imeis.length ? <tr><td colSpan={9} className="muted">No inventory matches the current scope and filters.</td></tr> : null}
            </tbody></table></div>
            {movementHistory ? <div className="card" style={{marginTop:16}}><div className="card-label">IMEI TRACE</div><div className="button-row"><strong>{movementHistory.imei}</strong><button className="ghost-button" onClick={()=>setMovementHistory(null)}>Close</button></div><div className="table-wrap"><table><thead><tr><th>When</th><th>Movement</th><th>Reason</th><th>Condition</th><th>Request / Approval / Acceptance</th></tr></thead><tbody>{movementHistory.items.map((m)=><tr key={m.id}><td>{new Date(m.createdAt).toLocaleString()}</td><td>{m.movementType.replaceAll('_',' ')}</td><td>{m.reason ?? m.notes ?? '—'}</td><td>{m.conditionBefore ?? '—'} → {m.conditionAfter ?? '—'}</td><td>{new Date(m.requestedAt).toLocaleString()} / {m.approvedAt ? new Date(m.approvedAt).toLocaleString() : '—'} / {m.acceptedAt ? new Date(m.acceptedAt).toLocaleString() : '—'}</td></tr>)}{!movementHistory.items.length?<tr><td colSpan={5} className="muted">No movement records.</td></tr>:null}</tbody></table></div></div> : null}
          </section>

          {canCreateProducts ? <section className="card"><div className="card-label">PRODUCT MASTER</div><h2>Catalog controls</h2><p className="muted">Catalog master data is separate from physical custody. Create a brand first, then a product model, then variants/SKUs.</p>
            <div className="grid three">
              <form className="setup-form-grid" onSubmit={createBrand}><strong>Create brand</strong><label>Brand name<input value={brandName} onChange={(e)=>setBrandName(e.target.value)} required placeholder="Samsung" /></label><button className="setup-primary" disabled={busy}>Create brand</button></form>
              <form className="setup-form-grid" onSubmit={createProduct}><strong>Create product</strong><label>Brand<select value={productForm.brandId} onChange={(e)=>setProductForm({...productForm,brandId:e.target.value})} required><option value="">Select brand</option>{brands.map((b)=><option key={b.id} value={b.id}>{b.brandName}</option>)}</select></label><label>Model<input value={productForm.modelName} onChange={(e)=>setProductForm({...productForm,modelName:e.target.value})} required /></label><label>Category<input value={productForm.category} onChange={(e)=>setProductForm({...productForm,category:e.target.value})} /></label><button className="setup-primary" disabled={busy}>Create product</button></form>
              <form className="setup-form-grid" onSubmit={createVariant}><strong>Create variant</strong><label>Product<select value={variantForm.productId} onChange={(e)=>setVariantForm({...variantForm,productId:e.target.value})} required><option value="">Select product</option>{products.map((p)=><option key={p.id} value={p.id}>{p.brandName} {p.modelName}</option>)}</select></label><label>SKU<input value={variantForm.sku} onChange={(e)=>setVariantForm({...variantForm,sku:e.target.value})} required /></label><label>RAM / storage<input value={variantForm.ram} onChange={(e)=>setVariantForm({...variantForm,ram:e.target.value})} placeholder="8GB / 256GB" /></label><label>Color<input value={variantForm.color} onChange={(e)=>setVariantForm({...variantForm,color:e.target.value})} /></label><button className="setup-primary" disabled={busy}>Create variant</button></form>
            </div>
            {(canEditProducts || canArchiveProducts) ? <div className="table-wrap" style={{marginTop:16}}><table><thead><tr><th>Brand</th><th>Product</th><th>Variant / SKU</th><th>Status</th><th>Lifecycle</th></tr></thead><tbody>{products.map((p)=><Fragment key={p.id}>{<tr><td>{p.brandName}</td><td><strong>{p.modelName}</strong><small>{p.category ?? '—'}</small></td><td>—</td><td>Active</td><td><div className="button-row">{canEditProducts?<button className="setup-secondary" disabled={busy} onClick={()=>void editProduct(p)}>Edit</button>:null}{canArchiveProducts?<button className="setup-secondary" disabled={busy} onClick={()=>void archiveCatalogResource('products',p.id,'product')}>Archive</button>:null}</div></td></tr>}{p.variants.map((v)=><tr key={v.id}><td>↳ {p.brandName}</td><td>↳ {p.modelName}</td><td><strong>{v.sku}</strong><small>{[v.ram,v.storage,v.color,v.network].filter(Boolean).join(' · ') || '—'}</small></td><td>{v.status}</td><td><div className="button-row">{canEditProducts?<button className="setup-secondary" disabled={busy} onClick={()=>void editVariant(v)}>Edit</button>:null}{canArchiveProducts?<button className="setup-secondary" disabled={busy} onClick={()=>void archiveCatalogResource('variants',v.id,'variant')}>Archive</button>:null}</div></td></tr>)}</Fragment>)}{brands.map((b)=><tr key={`brand-${b.id}`}><td><strong>{b.brandName}</strong></td><td colSpan={2}>Brand master</td><td>{b.status}</td><td><div className="button-row">{canEditProducts?<button className="setup-secondary" disabled={busy} onClick={()=>void editBrand(b)}>Edit</button>:null}{canArchiveProducts?<button className="setup-secondary" disabled={busy} onClick={()=>void archiveCatalogResource('brands',b.id,'brand')}>Archive</button>:null}</div></td></tr>)}{!products.length && !brands.length?<tr><td colSpan={5} className="muted">No catalog master data yet.</td></tr>:null}</tbody></table></div> : null}
          </section> : null}

          {canReconcile ? <section className="card"><div className="card-label">RECONCILIATION</div><h2>Physical vs system inventory</h2><p className="muted">Start a warehouse count, paste one scanned IMEI per line, then finalize. The system records found, missing, unexpected and observed custody/condition discrepancies without deleting inventory truth.</p>
            <form className="setup-form-grid" onSubmit={async (e) => { e.preventDefault(); const scans = reconcile.scannedText.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => ({ imei: line })); if (!reconcile.warehouseId || !scans.length) { setError('Select a warehouse and enter at least one scanned IMEI.'); return; } await submitMutation('Inventory reconciliation', async () => { const created = await apiFetch<{ reconciliationId:string }>('/v1/inventory/reconciliations', { method:'POST', headers:{'x-idempotency-key':crypto.randomUUID()}, body:JSON.stringify({ scope:{kind:'WAREHOUSE',id:reconcile.warehouseId}, notes:reconcile.notes || undefined }) }); await apiFetch('/v1/inventory/reconciliations/' + created.reconciliationId + '/scan', { method:'POST', headers:{'x-idempotency-key':crypto.randomUUID()}, body:JSON.stringify({ scans }) }); const finalized = await apiFetch('/v1/inventory/reconciliations/' + created.reconciliationId + '/finalize', { method:'POST', headers:{'x-idempotency-key':crypto.randomUUID()}, body:'{}' }); setNotice(JSON.stringify(finalized)); }); setReconcile({warehouseId:'',scannedText:'',notes:''}); }}>
              <label>Warehouse<select value={reconcile.warehouseId} onChange={(e)=>setReconcile({...reconcile,warehouseId:e.target.value})} required><option value="">Select warehouse</option>{warehouses.map((w)=><option key={w.id} value={w.id}>{w.code} — {w.name}{w.regionName ? ` — ${w.regionName}` : ''}</option>)}</select></label>
              <label>Notes<input value={reconcile.notes} onChange={(e)=>setReconcile({...reconcile,notes:e.target.value})} placeholder="Monthly physical count" /></label>
              <label>Scanned IMEIs<textarea value={reconcile.scannedText} onChange={(e)=>setReconcile({...reconcile,scannedText:e.target.value})} rows={8} required placeholder="3569...\n3569..." /></label>
              <button className="setup-primary" disabled={busy}>Finalize reconciliation</button>
            </form>
            <div className="table-wrap"><table><thead><tr><th>Started</th><th>Scope</th><th>Status</th><th>Expected</th><th>Found</th><th>Missing</th><th>Unexpected</th><th>Other discrepancies</th></tr></thead><tbody>{reconciliations.map((r)=><tr key={r.reconciliationId}><td>{new Date(r.startedAt).toLocaleString()}</td><td>{r.scopeType}</td><td>{r.status}</td><td>{r.expectedCount}</td><td>{r.foundCount}</td><td>{r.missingCount}</td><td>{r.unexpectedCount}</td><td>{r.wrongHolderCount + r.wrongRegionCount + r.wrongWarehouseCount + r.wrongConditionCount}</td></tr>)}{!reconciliations.length ? <tr><td colSpan={8} className="muted">No reconciliation runs yet.</td></tr> : null}</tbody></table></div>
          </section> : null}

          <section className="card"><div className="card-label">ALLOCATION CONTROL</div><h2>Custody transfer queue</h2><p className="muted">Requests move through request → approval → dispatch → receipt. Rejection or cancellation restores the exact source custody.</p><div className="table-wrap"><table><thead><tr><th>Requested</th><th>Allocation</th><th>Status</th><th>IMEIs</th><th>Actions</th></tr></thead><tbody>{allocations.map((a)=><tr key={a.allocationId}><td>{new Date(a.requestedAt).toLocaleString()}</td><td><code>{a.allocationId.slice(0,8)}</code></td><td>{a.status}</td><td>{a.imeiCount}</td><td><div className="button-row">{a.status==='REQUESTED'?<button className="setup-secondary" disabled={busy} onClick={()=>void submitMutation('Allocation approval',()=>apiFetch('/v1/inventory/allocations/'+a.allocationId+'/approve',{method:'POST',headers:{'x-idempotency-key':crypto.randomUUID()},body:'{}'}))}>Approve</button>:null}{a.status==='APPROVED'?<button className="setup-secondary" disabled={busy} onClick={()=>void submitMutation('Allocation dispatch',()=>apiFetch('/v1/inventory/allocations/'+a.allocationId+'/dispatch',{method:'POST',headers:{'x-idempotency-key':crypto.randomUUID()},body:'{}'}))}>Dispatch</button>:null}{a.status==='IN_TRANSIT'?<button className="setup-secondary" disabled={busy} onClick={()=>void submitMutation('Allocation receipt',()=>apiFetch('/v1/inventory/allocations/'+a.allocationId+'/receive',{method:'POST',headers:{'x-idempotency-key':crypto.randomUUID()},body:'{}'}))}>Receive</button>:null}</div></td></tr>)}{!allocations.length?<tr><td colSpan={5} className="muted">No allocation requests in your scope.</td></tr>:null}</tbody></table></div></section>

          {canReceive ? <section className="card"><div className="card-label">RECEIPT</div><h2>Receive physical stock</h2><p className="muted">One line per physical unit: <code>productVariantId, IMEI, IMEI2, serialNumber</code>. Maximum 250 units per atomic receipt.</p>
            <form className="setup-form-grid" onSubmit={receiveStock}><div className="grid two"><label>Warehouse<select value={receipt.warehouseId} onChange={(e)=>setReceipt({...receipt,warehouseId:e.target.value})} required><option value="">Select warehouse</option>{warehouses.map((w)=><option key={w.id} value={w.id}>{w.code} — {w.name}{w.regionName ? ` — ${w.regionName}` : ''}</option>)}</select></label><label>Condition<select value={receipt.conditionStatus} onChange={(e)=>setReceipt({...receipt,conditionStatus:e.target.value})}><option>NEW</option><option>GOOD</option><option>DAMAGED</option><option>QUARANTINED</option><option>WRITEOFF</option></select></label></div><label>Purchase reference<input value={receipt.purchaseReference} onChange={(e)=>setReceipt({...receipt,purchaseReference:e.target.value})} placeholder="PO-2026-001" /></label><label>IMEI lines<textarea value={receipt.unitsText} onChange={(e)=>setReceipt({...receipt,unitsText:e.target.value})} rows={8} required placeholder="variant-uuid,3569...,3520...,SN123\nvariant-uuid,3569..." /></label><button className="setup-primary" disabled={busy}>Receive stock</button></form>
          </section> : null}
        </section>
      </div>
    </main>
  );
}
