import type { DatabaseTransaction } from '@amaal/database';
import { authorize, loadAuthorizationContext } from '@amaal/permissions';
import { AuthorizationError, ValidationError } from '@amaal/shared';

function requirePermission(context: Awaited<ReturnType<typeof loadAuthorizationContext>>, permission: string): void {
  const decision=authorize(context,permission);
  if(!decision.allowed) throw new AuthorizationError(decision.reason);
}

export type SalesListOptions={
  q?: string;
  from?: string;
  to?: string;
  paymentType?: 'CASH'|'LOAN';
  sellerUserId?: string;
  limit?: number;
};

export class PostgresSaleReadService {
  async list(tx: DatabaseTransaction, actorUserId: string, options: SalesListOptions={}) {
    const context=await loadAuthorizationContext(tx,actorUserId); requirePermission(context,'sales.view');
    const q=options.q?.trim().toLowerCase()||null; const from=options.from?.trim()||null; const to=options.to?.trim()||null; const paymentType=options.paymentType||null; const sellerUserId=options.sellerUserId?.trim()||null; const limit=Math.min(Math.max(options.limit??100,1),200);
    return tx.query(`select s.id,s.sale_number as "saleNumber",s.sale_datetime as "saleDate",s.status,s.payment_type as "paymentType",s.subtotal,s.discount_amount as "discountAmount",s.total_amount as "totalAmount",s.amount_paid as "amountPaid",s.balance,s.seller_user_id as "sellerUserId",sp.display_name as "sellerName",s.customer_id as "customerId",c.customer_number as "customerNumber",c.full_name as "customerName",s.team_id as "teamId",t.team_name as "teamName",s.manager_user_id as "managerUserId",mp.display_name as "managerName",s.region_id as "regionId",r.region_name as "regionName",s.loan_provider_id as "loanProviderId",lp.provider_name as "loanProviderName",s.loan_reference as "loanReference",s.external_reference as "externalReference",s.created_at as "createdAt" from public.sales s join public.profiles sp on sp.user_id=s.seller_user_id join public.customers c on c.id=s.customer_id left join public.teams t on t.id=s.team_id left join public.profiles mp on mp.user_id=s.manager_user_id left join public.regions r on r.id=s.region_id left join public.loan_providers lp on lp.id=s.loan_provider_id where private.user_can_access_sale(s.id) and ($1::text is null or lower(s.sale_number||' '||c.full_name||' '||c.phone) like '%'||$1||'%') and ($2::timestamptz is null or s.sale_datetime >= $2) and ($3::timestamptz is null or s.sale_datetime < $3) and ($4::public.payment_type is null or s.payment_type=$4) and ($5::uuid is null or s.seller_user_id=$5) order by s.sale_datetime desc limit $6`,[q,from,to,paymentType,sellerUserId,limit]);
  }

  async get(tx: DatabaseTransaction, actorUserId: string, saleId: string) {
    const context=await loadAuthorizationContext(tx,actorUserId); requirePermission(context,'sales.view');
    const rows=await tx.query(`select s.id,s.sale_number as "saleNumber",s.sale_datetime as "saleDate",s.status,s.payment_type as "paymentType",s.subtotal,s.discount_amount as "discountAmount",s.total_amount as "totalAmount",s.amount_paid as "amountPaid",s.balance,s.seller_user_id as "sellerUserId",sp.display_name as "sellerName",s.customer_id as "customerId",c.customer_number as "customerNumber",c.full_name as "customerName",c.phone as "customerPhone",c.email as "customerEmail",s.team_id as "teamId",t.team_name as "teamName",s.manager_user_id as "managerUserId",mp.display_name as "managerName",s.region_id as "regionId",r.region_name as "regionName",s.loan_provider_id as "loanProviderId",lp.provider_name as "loanProviderName",s.loan_reference as "loanReference",s.deposit_amount as "depositAmount",s.financed_amount as "financedAmount",s.external_reference as "externalReference",s.created_at as "createdAt" from public.sales s join public.profiles sp on sp.user_id=s.seller_user_id join public.customers c on c.id=s.customer_id left join public.teams t on t.id=s.team_id left join public.profiles mp on mp.user_id=s.manager_user_id left join public.regions r on r.id=s.region_id left join public.loan_providers lp on lp.id=s.loan_provider_id where s.id=$1 and private.user_can_access_sale(s.id)`,[saleId]);
    if(rows.length!==1) throw new ValidationError('Sale not found or outside your organizational scope.');
    const items=await tx.query(`select si.id as "saleItemId",si.imei_id as "imeiId",i.imei,i.imei_2 as "imei2",si.product_variant_id as "productVariantId",b.brand_name as "brandName",p.model_name as "modelName",pv.sku,si.unit_price as "listPrice",si.discount_amount as "discountAmount",si.final_price as "finalPrice",si.line_total as "lineTotal",si.price_snapshot as "priceSnapshot",coalesce((select sum(c.amount) from public.commissions c where c.sale_id=si.sale_id and c.policy_id=si.commission_policy_id and c.beneficiary_user_id=(select seller_user_id from public.sales where id=$1) and c.status='ACTIVE'),0) as "commissionAmount" from public.sale_items si join public.imei_units i on i.id=si.imei_id join public.product_variants pv on pv.id=si.product_variant_id join public.products p on p.id=pv.product_id join public.brands b on b.id=p.brand_id where si.sale_id=$1 and si.is_active=true order by si.created_at`,[saleId]);
    const payments=await this.listPayments(tx,actorUserId,saleId);
    return {...rows[0],items,payments};
  }

  async listPayments(tx: DatabaseTransaction, actorUserId: string, saleId: string) {
    const context=await loadAuthorizationContext(tx,actorUserId); requirePermission(context,'payments.view');
    if(!(await tx.query(`select 1 from public.sales where id=$1 and private.user_can_access_sale(id)`,[saleId])).length) throw new AuthorizationError('Sale is outside your organizational scope.');
    return tx.query(`select id,payment_number as "paymentNumber",payment_type as "paymentType",method,amount,status,reference,external_reference as "externalReference",paid_at as "paidAt",received_at as "receivedAt",recorded_by as "recordedBy",received_by as "receivedBy",created_at as "createdAt" from public.payments where sale_id=$1 order by paid_at desc`,[saleId]);
  }
}
