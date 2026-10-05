'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, createSaleApi, listCustomersApi, listLoanProvidersApi, listSalesApi } from '../../lib/api';
import { authClient } from '../../lib/auth';
import { BrandLogo } from '../../components/brand-logo';
import { paymentTypeLabel, roleLabel } from '../../lib/display';

type Imei={imeiId:string;imei:string;imei2:string|null;productVariantId:string;sku:string;modelName:string;brandName:string;state:string;holderUserId:string|null;holderName:string|null};
type Customer={id:string;customerNumber:string;fullName:string;phone:string};
type Price={productVariantId:string;sellingPrice:number;minimumPrice:number;discountLimit:number;sku:string;modelName:string;brandName:string};
type DirectoryUser={userId:string;displayName:string;email:string|null;role:string};
type Line={imeiId:string;productVariantId:string;unitPrice:number;discountAmount:number};

export default function SalesPage(){
  const router=useRouter();
  const [customers,setCustomers]=useState<Customer[]>([]); const [imeis,setImeis]=useState<Imei[]>([]); const [prices,setPrices]=useState<Price[]>([]); const [directory,setDirectory]=useState<DirectoryUser[]>([]); const [loanProviders,setLoanProviders]=useState<Array<{id:string;providerName:string;providerCode:string;status:string}>>([]);
  const [sales,setSales]=useState<any[]>([]); const [sellerUserId,setSellerUserId]=useState(''); const [customerId,setCustomerId]=useState(''); const [paymentType,setPaymentType]=useState<'CASH'|'LOAN'>('CASH'); const [paymentMethod,setPaymentMethod]=useState('CASH'); const [paymentReference,setPaymentReference]=useState(''); const [loanProviderId,setLoanProviderId]=useState(''); const [loanReference,setLoanReference]=useState(''); const [depositAmount,setDepositAmount]=useState(0); const [dueAt,setDueAt]=useState(''); const [lines,setLines]=useState<Line[]>([{imeiId:'',productVariantId:'',unitPrice:0,discountAmount:0}]);
  const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [message,setMessage]=useState('');

  async function load(){
    try{ const session=await authClient.getSession(); if(!session?.data){router.replace('/login');return;} const [cust,inventory,policy,d,providers,s] = await Promise.all([
      listCustomersApi(),apiFetch<{items:Imei[]}>('/v1/inventory/imeis?limit=200'),apiFetch<{items:Price[]}>('/v1/catalog/price-policies'),apiFetch<{items:DirectoryUser[]}>('/v1/org/directory'),listLoanProvidersApi(),listSalesApi()
    ]); setCustomers(cust.items);setImeis(inventory.items);setPrices(policy.items);setDirectory(d.items);setLoanProviders(providers.items);setSales(s.items); if(!sellerUserId) setSellerUserId(session.data.user.id); }
    catch(e){setError(e instanceof Error?e.message:'Unable to load sales workspace.');} finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);

  const priceMap=useMemo(()=>new Map(prices.map(p=>[p.productVariantId,p])),[prices]);
  const eligibleImeis=useMemo(()=>imeis.filter(i=>['ALLOCATED_TO_MANAGER','ALLOCATED_TO_TEAM','ALLOCATED_TO_AGENT','ALLOCATED_TO_SHOP'].includes(i.state)),[imeis]);
  const total=useMemo(()=>lines.reduce((sum,l)=>sum+Math.max(l.unitPrice-l.discountAmount,0),0),[lines]);
  const financed=Math.max(0,Number((total-depositAmount).toFixed(2)));
  const sellerOptions=useMemo(()=>directory.filter(u=>['CEO','ADMIN','REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER'].includes(u.role)),[directory]);

  function changeImei(index:number,imeiId:string){const i=imeis.find(x=>x.imeiId===imeiId);const p=i?priceMap.get(i.productVariantId):undefined;setLines(xs=>xs.map((x,j)=>j===index?{...x,imeiId,productVariantId:i?.productVariantId??'',unitPrice:p?.sellingPrice??0,discountAmount:0}:x));}
  function addLine(){if(lines.length<20)setLines([...lines,{imeiId:'',productVariantId:'',unitPrice:0,discountAmount:0}]);}
  function removeLine(index:number){setLines(xs=>xs.length===1?xs:xs.filter((_,i)=>i!==index));}
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{if(!customerId)throw new Error('Select a customer.');if(lines.some(l=>!l.imeiId||!l.productVariantId||l.unitPrice<=0))throw new Error('Complete every sale line with an IMEI and valid price.');if(paymentType==='LOAN'&&!loanProviderId)throw new Error('Select a loan provider.');const result=await createSaleApi({sellerUserId,customerId,paymentType,paymentMethod,externalPaymentReference:paymentReference||undefined,loanProviderId:paymentType==='LOAN'?loanProviderId:undefined,loanReference:paymentType==='LOAN'?loanReference:undefined,depositAmount:paymentType==='LOAN'?depositAmount:undefined,financedAmount:paymentType==='LOAN'?financed:undefined,dueAt:paymentType==='LOAN'&&dueAt?dueAt:undefined,lines});setMessage(`Sale ${String(result.saleNumber)} completed. Receipt ${String(result.receiptId)}.`);setLines([{imeiId:'',productVariantId:'',unitPrice:0,discountAmount:0}]);setPaymentReference('');await load();}catch(e){setError(e instanceof Error?e.message:'Sale could not be completed.');}finally{setBusy(false);}}

  return <main className="app-shell"><header className="topbar"><div className="topbar-brand"><BrandLogo variant="full" className="topbar-full-logo" priority/><div className="topbar-subtitle">Sales</div></div><a className="ghost-button" href="/dashboard">Back to command center</a></header>
  <div className="workspace"><aside className="sidebar"><div className="section-label">OPERATIONS</div><nav><a className="nav-item" href="/dashboard">Command Center</a><a className="nav-item" href="/customers">Customers</a><a className="nav-item active" href="/sales">Sales & Receipts</a><a className="nav-item" href="/inventory">Inventory & Devices</a><a className="nav-item" href="/finance">Finance</a><a className="nav-item" href="/organization">People & Structure</a></nav><div className="section-label lower">INTELLIGENCE</div><a className="nav-item" href="/ai">Amaal AI</a></aside>
  <section className="content"><div className="content-header"><div><div className="eyebrow">SALES</div><h1>Complete a sale without breaking inventory truth.</h1><p className="muted">Price, device, customer and payment details are recorded together.</p></div></div>
  {error?<div className="alert-card">{error}</div>:null}{message?<div className="card"><strong>{message}</strong></div>:null}
  <section className="card"><div className="card-label">NEW SALE</div><form className="setup-form-grid" onSubmit={submit}>
    <label>Seller<select value={sellerUserId} onChange={e=>setSellerUserId(e.target.value)}>{sellerOptions.map(u=><option key={u.userId} value={u.userId}>{u.displayName} • {roleLabel(u.role)}</option>)}</select></label>
    <label>Customer<select value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.customerNumber} • {c.fullName} • {c.phone}</option>)}</select></label>
    <label>Payment type<select value={paymentType} onChange={e=>setPaymentType(e.target.value as 'CASH'|'LOAN')}><option value="CASH">Cash sale</option><option value="LOAN">Loan sale</option></select></label>
    <label>Payment method<input value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)} placeholder="Cash, mobile money, bank transfer…"/></label>
    <label>Payment reference<input value={paymentReference} onChange={e=>setPaymentReference(e.target.value)}/></label>
    {paymentType==='LOAN'?<><label>Loan provider<select value={loanProviderId} onChange={e=>setLoanProviderId(e.target.value)}><option value="">Select provider</option>{loanProviders.filter(p=>p.status==='ACTIVE').map(p=><option key={p.id} value={p.id}>{p.providerCode} • {p.providerName}</option>)}</select></label><label>Loan reference<input value={loanReference} onChange={e=>setLoanReference(e.target.value)}/></label><label>Deposit amount<input type="number" min="0" step="0.01" value={depositAmount} onChange={e=>setDepositAmount(Number(e.target.value))}/></label><label>Due date<input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label></>:null}
    <div className="wide"><div className="card-label">SALE LINES</div></div>
    {lines.map((line,index)=>{const selected=imeis.find(i=>i.imeiId===line.imeiId);const p=priceMap.get(line.productVariantId);return <div className="setup-next wide" key={index}><div className="setup-form-grid"><label>Device IMEI<select value={line.imeiId} onChange={e=>changeImei(index,e.target.value)}><option value="">Select device</option>{eligibleImeis.map(i=><option key={i.imeiId} value={i.imeiId}>{i.imei} • {i.brandName} {i.modelName} • {i.sku} • assigned to {i.holderName??'—'}</option>)}</select></label><label>Unit price<input type="number" min="0" step="0.01" value={line.unitPrice} onChange={e=>setLines(xs=>xs.map((x,j)=>j===index?{...x,unitPrice:Number(e.target.value)}:x))}/>{p?<small>Policy selling {p.sellingPrice}, minimum {p.minimumPrice}, max discount {p.discountLimit}</small>:null}</label><label>Discount<input type="number" min="0" step="0.01" value={line.discountAmount} onChange={e=>setLines(xs=>xs.map((x,j)=>j===index?{...x,discountAmount:Number(e.target.value)}:x))}/></label><label>Product<input readOnly value={selected?`${selected.brandName} ${selected.modelName} • ${selected.sku}`:''}/></label><div className="button-row"><button type="button" className="setup-secondary" onClick={()=>removeLine(index)} disabled={lines.length===1||busy}>Remove</button></div></div></div>})}
    <div className="button-row wide"><button type="button" className="setup-secondary" onClick={addLine} disabled={lines.length>=20||busy}>Add line</button><button className="setup-primary" disabled={busy}>Complete {paymentType==='LOAN'?'loan':'cash'} sale</button></div>
    <div className="card emphasis wide"><div className="card-label">TRANSACTION TOTAL</div><h2>{total.toFixed(2)}</h2><p className="muted">Paid: {(paymentType==='CASH'?total:depositAmount).toFixed(2)} • Balance: {(paymentType==='CASH'?0:financed).toFixed(2)}</p></div>
  </form></section>
  <section className="card"><div className="card-label">RECENT SALES</div><div className="table-wrap"><table><thead><tr><th>Sale</th><th>Customer</th><th>Seller</th><th>Type</th><th>Total</th><th>Paid</th><th>Balance</th><th>Date</th></tr></thead><tbody>{sales.map(s=><tr key={s.id}><td><strong>{s.saleNumber}</strong></td><td>{s.customerName}<br/><small>{s.customerNumber}</small></td><td>{s.sellerName}</td><td>{paymentTypeLabel(s.paymentType)}</td><td>{Number(s.totalAmount).toFixed(2)}</td><td>{Number(s.amountPaid).toFixed(2)}</td><td>{Number(s.balance).toFixed(2)}</td><td>{new Date(s.saleDate).toLocaleString()}</td></tr>)}{!loading&&!sales.length?<tr><td colSpan={8} className="muted">No sales were found.</td></tr>:null}</tbody></table></div></section>
  </section></div></main>
}
