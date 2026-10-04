'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, assignCustomerApi, createCustomerApi, listCustomersApi, type Customer } from '../../lib/api';
import { authClient } from '../../lib/auth';
import { BrandLogo } from '../../components/brand-logo';

type Me={authorization:{permissions:string[];roles:string[]}}
type DirectoryUser={userId:string;displayName:string;email:string|null;role:string;regionName:string|null;teamName:string|null;shopName:string|null};

export default function CustomersPage(){
  const router=useRouter();
  const [items,setItems]=useState<Customer[]>([]); const [directory,setDirectory]=useState<DirectoryUser[]>([]); const [canAssign,setCanAssign]=useState(false);
  const [q,setQ]=useState(''); const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [message,setMessage]=useState('');
  const [form,setForm]=useState({fullName:'',phone:'',email:'',address:'',customerType:'INDIVIDUAL',identityReference:'',consentStatus:'PENDING'});
  const [assignment,setAssignment]=useState({customerId:'',newOwnerUserId:'',reason:''});

  async function load(){
    setError('');
    try{ const session=await authClient.getSession(); if(!session?.data){router.replace('/login');return;} const [customers,me,d] = await Promise.all([listCustomersApi(q),apiFetch<Me>('/v1/me'),apiFetch<{items:DirectoryUser[]}>('/v1/org/directory')]); setItems(customers.items); setDirectory(d.items); setCanAssign(me.authorization.permissions.includes('customers.assign')); }
    catch(e){setError(e instanceof Error?e.message:'Unable to load customers.');} finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[q]);

  async function create(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{const r=await createCustomerApi(form as never);setMessage(`Customer ${r.customerNumber} created.`);setForm({fullName:'',phone:'',email:'',address:'',customerType:'INDIVIDUAL',identityReference:'',consentStatus:'PENDING'});await load();}catch(e){setError(e instanceof Error?e.message:'Customer creation failed.');}finally{setBusy(false);}}
  async function assign(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{await assignCustomerApi(assignment.customerId,assignment.newOwnerUserId,assignment.reason);setMessage('Customer reassigned.');setAssignment({customerId:'',newOwnerUserId:'',reason:''});await load();}catch(e){setError(e instanceof Error?e.message:'Customer reassignment failed.');}finally{setBusy(false);}}

  const activeOwners=useMemo(()=>directory.filter((u)=>['AGENT','SHOP_OWNER','TEAM_LEADER','MANAGER','REGIONAL_MANAGER'].includes(u.role)),[directory]);

  return <main className="app-shell"><header className="topbar"><div className="topbar-brand"><BrandLogo variant="full" className="topbar-full-logo" priority/><div className="topbar-subtitle">Customers</div></div><a className="ghost-button" href="/dashboard">Back to command center</a></header>
    <div className="workspace"><aside className="sidebar"><div className="section-label">OPERATIONS</div><nav><a className="nav-item" href="/dashboard">Command Center</a><a className="nav-item active" href="/customers">Customers</a><a className="nav-item" href="/sales">Sales & Receipts</a><a className="nav-item" href="/inventory">Inventory & IMEI</a><a className="nav-item" href="/finance">Finance</a><a className="nav-item" href="/organization">People & Structure</a></nav><div className="section-label lower">INTELLIGENCE</div><a className="nav-item" href="/dashboard">Amaal AI</a></aside>
    <section className="content"><div className="content-header"><div><div className="eyebrow">PHASE 4 • CUSTOMER DOMAIN</div><h1>Customer ownership that follows the organization.</h1><p className="muted">Customer records carry explicit seller, shop, team, sub-region and region scope.</p></div></div>
      {error?<div className="alert-card">{error}</div>:null}{message?<div className="card"><strong>{message}</strong></div>:null}
      <div className="grid two"><section className="card"><div className="card-label">NEW CUSTOMER</div><form className="setup-form-grid" onSubmit={create}>
        <label>Full name<input value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}/></label><label>Phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
        <label>Email<input value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Customer type<select value={form.customerType} onChange={e=>setForm({...form,customerType:e.target.value})}><option>INDIVIDUAL</option><option>BUSINESS</option></select></label>
        <label className="wide">Address<input value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label><label>Identity reference<input value={form.identityReference} onChange={e=>setForm({...form,identityReference:e.target.value})}/></label>
        <label>Consent<select value={form.consentStatus} onChange={e=>setForm({...form,consentStatus:e.target.value})}><option>PENDING</option><option>GIVEN</option><option>DECLINED</option></select></label>
        <div className="button-row"><button className="setup-primary" disabled={busy}>Create customer</button></div>
      </form></section>
      <section className="card"><div className="card-label">SEARCH</div><input placeholder="Name, phone, email or customer number" value={q} onChange={e=>setQ(e.target.value)}/><p className="muted">Results are automatically limited to the current user's authorized customer scope.</p></section></div>
      {canAssign?<section className="card"><div className="card-label">CONTROLLED REASSIGNMENT</div><form className="setup-form-grid" onSubmit={assign}><label>Customer<select value={assignment.customerId} onChange={e=>setAssignment({...assignment,customerId:e.target.value})}><option value="">Select customer</option>{items.map(c=><option key={c.id} value={c.id}>{c.customerNumber} • {c.fullName} • {c.ownerName??'Unassigned'}</option>)}</select></label><label>New owner<select value={assignment.newOwnerUserId} onChange={e=>setAssignment({...assignment,newOwnerUserId:e.target.value})}><option value="">Select user</option>{activeOwners.map(u=><option key={u.userId} value={u.userId}>{u.displayName} • {u.role}{u.teamName?` • ${u.teamName}`:''}</option>)}</select></label><label className="wide">Reason<input value={assignment.reason} onChange={e=>setAssignment({...assignment,reason:e.target.value})} placeholder="Document why ownership changed"/></label><div className="button-row"><button className="setup-secondary" disabled={busy||!assignment.customerId||!assignment.newOwnerUserId}>Reassign customer</button></div></form></section>:null}
      <section className="card"><div className="card-label">CUSTOMER DIRECTORY</div><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Contact</th><th>Owner</th><th>Region</th><th>Team / Shop</th><th>Consent</th></tr></thead><tbody>{items.map(c=><tr key={c.id}><td><strong>{c.fullName}</strong><br/><small>{c.customerNumber}</small></td><td>{c.phone}<br/><small>{c.email??'—'}</small></td><td>{c.ownerName??'—'}</td><td>{c.regionName??'—'}<br/><small>{c.subregionName??''}</small></td><td>{c.teamName??'—'}<br/><small>{c.shopName??''}</small></td><td>{c.consentStatus??'—'}</td></tr>)}{!loading&&!items.length?<tr><td colSpan={6} className="muted">No customers found in your current scope.</td></tr>:null}</tbody></table></div></section>
    </section></div></main>
}
