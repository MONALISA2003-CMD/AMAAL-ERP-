import type { DatabaseTransaction } from '@amaal/database';
import { authorize, loadAuthorizationContext } from '@amaal/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@amaal/shared';
import { assertImeiTransition, type ImeiState } from '@amaal/business-rules';

type SaleContext = {
  id: string;
  status: string;
  seller_user_id: string;
  payment_type: string;
  region_id: string | null;
  team_id: string | null;
};

type SaleItemContext = {
  id: string;
  imei_id: string;
  pre_sale_state: ImeiState | null;
  pre_sale_holder_user_id: string | null;
  pre_sale_warehouse_id: string | null;
  pre_sale_region_id: string | null;
  pre_sale_team_id: string | null;
  pre_sale_shop_id: string | null;
};

export class PostgresFinanceService {
  async reverseSale(tx: DatabaseTransaction, actorUserId: string, saleId: string, reason: string): Promise<void> {
    if (!reason.trim()) throw new ValidationError('Reversal reason is required.');
    const context = await loadAuthorizationContext(tx, actorUserId);
    const decision = authorize(context, 'sales.reverse');
    if (!decision.allowed) throw new AuthorizationError(decision.reason);

    const sales = await tx.query<SaleContext>(`select id,status,seller_user_id,payment_type,region_id,team_id from public.sales where id=$1 for update`, [saleId]);
    if (sales.length !== 1) throw new ValidationError('Sale not found.');
    const sale = sales[0]!;
    if (sale.status !== 'COMPLETED') throw new ConflictError(`Sale is ${sale.status}; only COMPLETED sales may be reversed.`);

    const items = await tx.query<SaleItemContext>(
      `select id,imei_id,pre_sale_state,pre_sale_holder_user_id,pre_sale_warehouse_id,pre_sale_region_id,pre_sale_team_id,pre_sale_shop_id
       from public.sale_items where sale_id=$1 and is_active=true for update`, [saleId]);
    if (!items.length) throw new ValidationError('Sale has no active line items.');

    const payments = await tx.query<{ id: string; amount: string; status: string }>(`select id,amount::text,status from public.payments where sale_id=$1 and status='COMPLETED' for update`, [saleId]);

    for (const item of items) {
      if (!item.pre_sale_state) throw new ConflictError('Sale line lacks pre-sale inventory provenance; reversal is blocked safely.');
      const imeis = await tx.query<{ imei: string; state: ImeiState; condition_status: string }>(`select imei,state,condition_status from public.imei_units where id=$1 for update`, [item.imei_id]);
      if (imeis.length !== 1) throw new ValidationError('IMEI not found for sale reversal.');
      const imei = imeis[0]!;
      if (imei.state !== 'SOLD') throw new ConflictError(`IMEI ${imei.imei} is ${imei.state}; expected SOLD.`);
      assertImeiTransition(imei.state, item.pre_sale_state);
      await tx.query(
        `update public.imei_units set state=$1,current_holder_user_id=$2,current_warehouse_id=$3,current_region_id=$4,current_team_id=$5,current_shop_id=$6,
         current_holder_started_at=case when $2 is not null then now() else null end,updated_at=now() where id=$7`,
        [item.pre_sale_state,item.pre_sale_holder_user_id,item.pre_sale_warehouse_id,item.pre_sale_region_id,item.pre_sale_team_id,item.pre_sale_shop_id,item.imei_id],
      );
      await tx.query(
        `insert into public.inventory_movements
         (imei_id,from_holder_user_id,to_holder_user_id,from_warehouse_id,to_warehouse_id,from_team_id,to_team_id,from_shop_id,to_shop_id,reason,movement_type,requested_by,accepted_by,requested_at,accepted_at,condition_before,condition_after,notes)
         values ($1,null,$2,null,$3,null,$4,null,$5,$6,'RETURN',$7,$7,now(),now(),$8,$8,$9)`,
        [item.imei_id,item.pre_sale_holder_user_id,item.pre_sale_warehouse_id,item.pre_sale_team_id,item.pre_sale_shop_id,reason,actorUserId,imei.condition_status,`Sale ${saleId} reversed`],
      );
      await tx.query(`update public.sale_items set is_active=false,reversed_at=now() where id=$1`, [item.id]);
    }

    for (const payment of payments) {
      await tx.query(
        `insert into public.payment_reversals(payment_id,sale_id,amount,reason,reversed_by)
         values ($1,$2,$3::numeric,$4,$5)`, [payment.id,saleId,payment.amount,reason,actorUserId],
      );
      await tx.query(`update public.payments set status='REVERSED' where id=$1`, [payment.id]);
    }

    const commissions = await tx.query<{ id:string; amount:string; beneficiary_user_id:string }>(
      `select c.id,c.amount::text,c.beneficiary_user_id
       from public.commissions c where c.sale_id=$1 and c.status='ACTIVE' for update`, [saleId],
    );
    for (const commission of commissions) {
      const prior = await tx.query<{ total:string }>(
        `select coalesce(sum(amount),0)::text as total from public.commission_adjustments where commission_id=$1 and adjustment_type='REVERSAL'`,
        [commission.id],
      );
      const remaining = Number(commission.amount) - Number(prior[0]?.total ?? '0');
      if (remaining <= 0) continue;
      await tx.query(
        `insert into public.commission_adjustments(commission_id,sale_id,beneficiary_user_id,adjustment_type,amount,reason,created_by)
         values ($1,$2,$3,'REVERSAL',$4::numeric,$5,$6)`,
        [commission.id,saleId,commission.beneficiary_user_id,remaining,`Sale ${saleId} reversed`,actorUserId],
      );
      await tx.query(
        `insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,team_id,actor_user_id,payload)
         values ('COMMISSION_ADJUSTED','COMMISSION',$1,$2,$3,$4,$5::jsonb)`,
        [commission.id,sale.region_id,sale.team_id,actorUserId,JSON.stringify({commission_id:commission.id,sale_id:saleId,beneficiary_user_id:commission.beneficiary_user_id,adjustment_type:'REVERSAL',amount:remaining})],
      );
    }

    await tx.query(`update public.receipts set status='VOIDED',voided_at=now(),void_reason=$1 where sale_id=$2`, [reason,saleId]);
    await tx.query(`update public.sales set status='REVERSED',amount_paid=0,balance=0,updated_at=now() where id=$1`, [saleId]);
    await tx.query(
      `insert into public.audit_events(actor_user_id,action,target_type,target_id,previous_state,new_state,reason,request_id)
       values ($1,'SALE_REVERSED','SALE',$2,$3::jsonb,$4::jsonb,$5,current_setting('amaal.request_id', true))`,
      [actorUserId,saleId,JSON.stringify({ status: 'COMPLETED' }),JSON.stringify({ status: 'REVERSED' }),reason],
    );
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload)
      values ('SALE_REVERSED','SALE',$1,$2,$3::jsonb)`, [saleId,actorUserId,JSON.stringify({ sale_id:saleId,payment_count:payments.length,reason })]);
  }
}
