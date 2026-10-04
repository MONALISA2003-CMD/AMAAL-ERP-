import { randomUUID } from 'node:crypto';
import type { DatabaseTransaction } from '@amaal/database';
import { authorize, loadAuthorizationContext } from '@amaal/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@amaal/shared';

function requirePermission(context: Awaited<ReturnType<typeof loadAuthorizationContext>>, permission: string): void {
  const decision = authorize(context, permission);
  if (!decision.allowed) throw new AuthorizationError(decision.reason);
}

function number(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export type PaymentAdjustmentInput = {
  paymentId: string;
  adjustmentType: 'REPLACEMENT' | 'REVERSAL';
  replacementAmount?: number;
  reason: string;
  approvalId: string;
};

export class PostgresPaymentService {
  async list(tx: DatabaseTransaction, actorUserId: string, saleId: string) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'payments.view');
    const allowed = await tx.query(`select 1 from public.sales where id=$1 and private.user_can_access_sale(id)`, [saleId]);
    if (!allowed.length) throw new AuthorizationError('Sale is outside your organizational scope.');
    return tx.query(`
      select p.id,p.payment_number as "paymentNumber",p.sale_id as "saleId",p.customer_id as "customerId",
             p.payment_type as "paymentType",p.method,p.amount,p.status,p.external_reference as "externalReference",
             p.reference,p.paid_at as "paidAt",p.received_at as "receivedAt",p.recorded_by as "recordedBy",
             rp.display_name as "recordedByName",p.received_by as "receivedBy",rv.display_name as "receivedByName",
             p.adjustment_of_payment_id as "adjustmentOfPaymentId",p.created_at as "createdAt"
      from public.payments p
      left join public.profiles rp on rp.user_id=p.recorded_by
      left join public.profiles rv on rv.user_id=p.received_by
      where p.sale_id=$1 order by p.created_at desc
    `, [saleId]);
  }

  async listAdjustments(tx: DatabaseTransaction, actorUserId: string, paymentId?: string, limit = 100) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'payments.view');
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return tx.query(`
      select a.id,a.original_payment_id as "originalPaymentId",op.payment_number as "originalPaymentNumber",
             a.replacement_payment_id as "replacementPaymentId",rp.payment_number as "replacementPaymentNumber",
             a.adjustment_type as "adjustmentType",a.original_amount as "originalAmount",a.replacement_amount as "replacementAmount",
             a.approval_id as "approvalId",a.reason,a.adjusted_by as "adjustedBy",ap.display_name as "adjustedByName",a.created_at as "createdAt"
      from public.payment_adjustments a
      join public.payments op on op.id=a.original_payment_id
      left join public.payments rp on rp.id=a.replacement_payment_id
      left join public.profiles ap on ap.user_id=a.adjusted_by
      where ($1::uuid is null or a.original_payment_id=$1 or a.replacement_payment_id=$1)
        and private.user_can_access_sale(op.sale_id)
      order by a.created_at desc limit $2
    `, [paymentId?.trim() || null, safeLimit]);
  }

  async adjust(tx: DatabaseTransaction, actorUserId: string, input: PaymentAdjustmentInput) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'payments.adjust');
    if (!input.reason.trim()) throw new ValidationError('Payment adjustment reason is required.');
    if (!input.approvalId.trim()) throw new ValidationError('An approved financial-correction approval is required.');

    const rows = await tx.query<{id:string; sale_id:string; customer_id:string; payment_type:'CASH'|'LOAN'; method:string; amount:string; status:string; external_reference:string|null; reference:string|null}>(`
      select id,sale_id,customer_id,payment_type,method,amount,status,external_reference,reference
      from public.payments where id=$1 for update`, [input.paymentId]);
    if (rows.length !== 1) throw new ValidationError('Payment not found.');
    const payment = rows[0]!;
    if (payment.status !== 'COMPLETED') throw new ConflictError(`Payment is ${payment.status} and cannot be adjusted.`);
    if (payment.adjustment_of_payment_id) throw new ConflictError('Replacement payments cannot be adjusted again; create a new financial correction against the original payment.');
    const existingAdjustment = await tx.query(`select 1 from public.payment_adjustments where original_payment_id=$1 limit 1`, [input.paymentId]);
    if (existingAdjustment.length) throw new ConflictError('This payment already has a financial correction.');

    const saleScope = await tx.query<{payment_type:'CASH'|'LOAN'; total_amount:string}>(`select payment_type,total_amount::text from public.sales where id=$1 and private.user_can_access_sale(id)`, [payment.sale_id]);
    if (!saleScope.length) throw new AuthorizationError('Payment is outside your organizational scope.');

    const approvals = await tx.query<{status:string; approval_type:string; requested_by:string; target_type:string; target_id:string}>(`select status,approval_type,requested_by,target_type,target_id from public.approval_requests where id=$1 for update`, [input.approvalId]);
    if (approvals.length !== 1) throw new ValidationError('Approval request was not found.');
    const approval = approvals[0]!;
    if (approval.status !== 'APPROVED' || approval.approval_type !== 'FINANCIAL_CORRECTION' || approval.target_type !== 'PAYMENT' || approval.target_id !== input.paymentId) {
      throw new AuthorizationError('The supplied approval is not an approved financial correction for this payment.');
    }
    if (approval.requested_by === actorUserId) throw new AuthorizationError('Requester cannot execute the approved payment correction.');

    const originalAmount = Number(payment.amount);
    const replacementAmount = input.adjustmentType === 'REVERSAL' ? 0 : Number(input.replacementAmount);
    if (!Number.isFinite(replacementAmount) || replacementAmount < 0) throw new ValidationError('replacementAmount must be a non-negative number.');
    const saleTotal = saleScope[0] ? Number(saleScope[0].total_amount) : NaN;
    const aggregatePaidRows = await tx.query<{paid:string}>(`select coalesce(sum(amount),0)::text as paid from public.payments where sale_id=$1 and status='COMPLETED' and id<>$2`, [payment.sale_id,input.paymentId]);
    const projectedPaid = Number(aggregatePaidRows[0]?.paid ?? 0) + replacementAmount;
    if (!Number.isFinite(saleTotal)) throw new ValidationError('Sale total could not be resolved.');
    if (projectedPaid > saleTotal + 0.005) throw new ValidationError('Financial correction would overpay the sale.');
    if (saleScope[0]?.payment_type === 'CASH' && Math.abs(projectedPaid - saleTotal) > 0.005) {
      throw new ValidationError('A completed CASH sale must remain fully paid after a payment correction.');
    }

    const newStatus = input.adjustmentType === 'REVERSAL' ? 'REVERSED' : 'ADJUSTED';
    await tx.query(`update public.payments set status=$1 where id=$2`, [newStatus, input.paymentId]);

    const replacementPayment = await tx.query<{id:string; payment_number:string}>(`
      insert into public.payments(payment_number,sale_id,customer_id,payment_type,method,amount,status,external_reference,reference,paid_at,received_at,recorded_by,received_by,adjustment_of_payment_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now(),$10,$10,$11) returning id,payment_number
    `, [number('PAY'),payment.sale_id,payment.customer_id,payment.payment_type,payment.method,replacementAmount,'COMPLETED',payment.external_reference,payment.reference,actorUserId,input.paymentId]);
    if (replacementPayment.length !== 1) throw new ValidationError('Replacement payment could not be recorded.');

    await tx.query(`insert into public.payment_adjustments(original_payment_id,replacement_payment_id,adjustment_type,original_amount,replacement_amount,approval_id,reason,adjusted_by) values($1,$2,$3,$4,$5,$6,$7,$8)`, [input.paymentId,replacementPayment[0]!.id,input.adjustmentType,originalAmount,replacementAmount,input.approvalId,input.reason.trim(),actorUserId]);

    const totals = await tx.query<{amount_paid:string; total_amount:string}>(`select total_amount::text,(select coalesce(sum(p.amount),0)::text from public.payments p where p.sale_id=s.id and p.status='COMPLETED') as amount_paid from public.sales s where s.id=$1 for update`, [payment.sale_id]);
    if (totals.length === 1) {
      const paid = Number(totals[0]!.amount_paid);
      const total = Number(totals[0]!.total_amount);
      await tx.query(`update public.sales set amount_paid=$1,balance=greatest($2-$1,0),updated_at=now() where id=$3`, [paid,total,payment.sale_id]);
      await tx.query(`update public.receivables set outstanding_amount=greatest($1,0),status=case when greatest($1,0)=0 then 'PAID' when $2>0 then 'PARTIALLY_PAID' else 'OPEN' end,updated_at=now() where sale_id=$3 and status <> 'CANCELLED'`, [total-paid,paid,payment.sale_id]);
    }

    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,approval_id,request_id) values($1,'PAYMENT_ADJUSTED','PAYMENT',$2,$3::jsonb,$4,$5,current_setting('amaal.request_id',true))`, [actorUserId,input.paymentId,JSON.stringify({adjustmentType:input.adjustmentType,replacementPaymentId:replacementPayment[0]!.id,originalAmount,replacementAmount}),input.reason.trim(),input.approvalId]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('PAYMENT_ADJUSTED','PAYMENT',$1,$2,$3::jsonb)`, [input.paymentId,actorUserId,JSON.stringify({payment_id:input.paymentId, replacement_payment_id:replacementPayment[0]!.id, adjustment_type:input.adjustmentType})]);
    return { originalPaymentId: input.paymentId, replacementPaymentId: replacementPayment[0]!.id, paymentNumber: replacementPayment[0]!.payment_number, replacementAmount };
  }
}
