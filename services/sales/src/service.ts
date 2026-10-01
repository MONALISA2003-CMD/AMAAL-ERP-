import { randomUUID } from 'node:crypto';
import type { DatabaseTransaction } from '@amaal/database';
import { DomainError, AuthorizationError, ConflictError, ValidationError } from '@amaal/shared';
import { assertPositiveMoney, assertNonEmpty } from '@amaal/business-rules';
import { authorize, loadAuthorizationContext } from '@amaal/permissions';
import type { CreateSaleCommand } from './index.ts';
import { createDirectSellerCommission } from '@amaal/finance';

interface ImeiRow {
  id: string;
  imei: string;
  product_variant_id: string;
  state: string;
  current_holder_user_id: string | null;
  current_warehouse_id: string | null;
  current_region_id: string | null;
  condition_status: string;
}

interface CustomerRow { id: string; created_by: string; region_id: string | null; team_id: string | null; }
interface PricePolicyRow { id: string; selling_price: string; minimum_price: string; }
interface SellerScopeRow { region_id: string | null; team_id: string | null; manager_user_id: string | null; }

function money(value: number): string { return value.toFixed(2); }

function assertSaleEligibility(state: string): void {
  const allowed = new Set(['ALLOCATED_TO_MANAGER', 'ALLOCATED_TO_TEAM', 'ALLOCATED_TO_AGENT', 'ALLOCATED_TO_SHOP']);
  if (!allowed.has(state)) throw new ConflictError(`IMEI cannot be sold from state ${state}.`);
}

export class PostgresSaleService {
  async createAndCompleteSale(tx: DatabaseTransaction, actorUserId: string, command: CreateSaleCommand): Promise<{ saleId: string; saleNumber: string; receiptId: string }> {
    assertNonEmpty(actorUserId, 'actorUserId');
    assertNonEmpty(command.sellerUserId, 'sellerUserId');
    assertNonEmpty(command.customerId, 'customerId');
    if (command.lines.length !== 1) throw new ValidationError('Phase-1 sale transaction currently supports exactly one IMEI line per sale.');
    if (command.paymentType !== 'CASH') throw new ValidationError('Loan sale execution remains gated until loan-provider and repayment rules are finalized.');

    const authContext = await loadAuthorizationContext(tx, actorUserId);
    const decision = authorize(authContext, 'sales.create', { ownerUserId: command.sellerUserId });
    if (!decision.allowed) throw new AuthorizationError(decision.reason);
    if (command.sellerUserId !== actorUserId && !authContext.roles.some((role) => ['CEO', 'ADMIN', 'MANAGER', 'TEAM_LEADER'].includes(role))) {
      throw new AuthorizationError('Seller must be the authenticated user for this role.');
    }

    const line = command.lines[0];
    if (!line) throw new ValidationError('At least one sale line is required.');
    assertPositiveMoney(line.unitPrice);

    const customerRows = await tx.query<CustomerRow>(
      `select c.id,c.created_by,
              creator_scope.region_id,
              creator_scope.team_id
       from public.customers c
       left join lateral (
         select coalesce(ra.region_id,t.region_id) as region_id,
                coalesce(ra.team_id,tm.team_id) as team_id
         from public.role_assignments ra
         left join public.team_memberships tm on tm.user_id=ra.user_id and tm.status='ACTIVE' and (tm.effective_to is null or tm.effective_to > now())
         left join public.teams t on t.id=coalesce(ra.team_id,tm.team_id)
         where ra.user_id=c.created_by and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to > now())
         order by case when ra.team_id is not null then 0 else 1 end
         limit 1
       ) creator_scope on true
       where c.id=$1 and c.status='ACTIVE' for share`,
      [command.customerId],
    );
    if (customerRows.length !== 1) throw new ValidationError('Customer not found or inactive.');
    const customer = customerRows[0]!;
    const customerResource = {
      ownerUserId: customer.created_by,
      ...(customer.region_id ? { regionId: customer.region_id } : {}),
      ...(customer.team_id ? { teamId: customer.team_id } : {}),
    };
    const customerDecision = authorize(authContext, 'customers.view', customerResource);
    if (!customerDecision.allowed) throw new AuthorizationError('Customer is outside the seller organizational scope.');

    const imeis = await tx.query<ImeiRow>(
      `select id,imei,product_variant_id,state,current_holder_user_id,current_warehouse_id,current_region_id,condition_status
       from public.imei_units where id=$1 for update`,
      [line.imeiId],
    );
    if (imeis.length !== 1) throw new ValidationError('IMEI not found.');
    const imei = imeis[0]!;
    assertSaleEligibility(imei.state);
    if (imei.current_holder_user_id !== command.sellerUserId) throw new AuthorizationError('Seller is not the current accountable holder of this IMEI.');
    if (imei.product_variant_id !== line.productVariantId) throw new ValidationError('Product variant does not match the IMEI registry.');

    const policies = await tx.query<PricePolicyRow>(
      `select id,selling_price::text,minimum_price::text
       from public.price_policies
       where product_variant_id=$1 and status='ACTIVE' and effective_from <= now() and (effective_to is null or effective_to > now())
       order by effective_from desc limit 1`,
      [line.productVariantId],
    );
    if (policies.length !== 1) throw new ValidationError('No active price policy exists for this product variant.');
    const policy = policies[0]!;
    const selling = Number(policy.selling_price);
    const minimum = Number(policy.minimum_price);
    if (line.unitPrice < minimum || line.unitPrice > selling) throw new ValidationError(`Sale price must be between ${minimum.toFixed(2)} and ${selling.toFixed(2)}.`);

    const sellerScopes = await tx.query<SellerScopeRow>(
      `select coalesce(ra.region_id,m.region_id,t.region_id) as region_id,
              coalesce(ra.team_id,tm.team_id) as team_id,
              coalesce(t.manager_user_id, m.user_id) as manager_user_id
       from public.role_assignments ra
       left join public.managers m on m.user_id=ra.user_id and m.status='ACTIVE'
       left join public.team_memberships tm on tm.user_id=ra.user_id and tm.status='ACTIVE' and (tm.effective_to is null or tm.effective_to > now())
       left join public.teams t on t.id=coalesce(ra.team_id,tm.team_id)
       where ra.user_id=$1 and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to > now())
       order by case when ra.team_id is not null then 0 when ra.region_id is not null then 1 else 2 end limit 1`,
      [command.sellerUserId],
    );
    const sellerScope = sellerScopes[0] ?? { region_id: imei.current_region_id, team_id: null, manager_user_id: null };

    const saleNumber = `SAL-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomUUID().slice(0,8).toUpperCase()}`;
    const receiptNumber = `RCT-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomUUID().slice(0,8).toUpperCase()}`;
    const paymentNumber = `PAY-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomUUID().slice(0,8).toUpperCase()}`;
    const saleTotal = money(line.unitPrice);

    const saleRows = await tx.query<{ id:string }>(
      `insert into public.sales
       (organization_id,sale_number,seller_user_id,customer_id,status,payment_type,subtotal,discount_amount,total_amount,team_id,manager_user_id,region_id,amount_paid,balance,completed_at)
       select p.organization_id,$1,$2,$3,'COMPLETED','CASH',$4::numeric,0,$4::numeric,$5,$6,$7,$4::numeric,0,now()
       from public.profiles p where p.user_id=$2 returning id`,
      [saleNumber,command.sellerUserId,command.customerId,saleTotal,sellerScope.team_id,sellerScope.manager_user_id,sellerScope.region_id],
    );
    if (saleRows.length !== 1) throw new DomainError('Could not create sale.', 'SALE_CREATE_FAILED');
    const saleId = saleRows[0]!.id;

    const saleItemRows = await tx.query<{ id:string }>(
      `insert into public.sale_items
       (sale_id,imei_id,product_variant_id,quantity,unit_price,applied_price_policy_id,price_snapshot,line_total,pre_sale_state,pre_sale_holder_user_id,pre_sale_warehouse_id,pre_sale_region_id)
       values ($1,$2,$3,1,$4::numeric,$5,$6::jsonb,$4::numeric,$7,$8,$9,$10)
       returning id`,
      [saleId,line.imeiId,line.productVariantId,saleTotal,policy.id,JSON.stringify({selling_price:selling,minimum_price:minimum}),imei.state,imei.current_holder_user_id,imei.current_warehouse_id,imei.current_region_id],
    );
    if (saleItemRows.length !== 1) throw new DomainError('Could not create sale item.', 'SALE_ITEM_CREATE_FAILED');

    await tx.query(
      `insert into public.payments(payment_number,sale_id,customer_id,payment_type,amount,status,external_reference,paid_at,recorded_by)
       values ($1,$2,$3,'CASH',$4::numeric,'COMPLETED',$5,now(),$6)`,
      [paymentNumber,saleId,command.customerId,saleTotal,command.externalPaymentReference ?? null,actorUserId],
    );

    const receiptRows = await tx.query<{ id:string }>(
      `insert into public.receipts(receipt_number,sale_id,generated_by,receipt_snapshot,status)
       values ($1,$2,$3,$4::jsonb,'ISSUED') returning id`,
      [receiptNumber,saleId,actorUserId,JSON.stringify({saleNumber,customerId:command.customerId,sellerUserId:command.sellerUserId,imei:imei.imei,total:Number(saleTotal),paymentType:'CASH'})],
    );
    if (receiptRows.length !== 1) throw new DomainError('Could not create receipt.', 'RECEIPT_CREATE_FAILED');

    const organizationRows = await tx.query<{ organization_id:string }>(`select organization_id from public.profiles where user_id=$1`, [command.sellerUserId]);
    if (organizationRows.length !== 1) throw new DomainError('Seller organization could not be resolved.', 'SELLER_ORGANIZATION_MISSING');
    const commission = await createDirectSellerCommission(tx, {
      saleId,
      saleAmount: Number(saleTotal),
      productVariantId: line.productVariantId,
      sellerUserId: command.sellerUserId,
      organizationId: organizationRows[0]!.organization_id,
    });
    if (commission) {
      await tx.query(`update public.sale_items set commission_policy_id=$1 where id=$2`, [commission.policyId, saleItemRows[0]!.id]);
      await tx.query(
        `insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,team_id,actor_user_id,payload)
         values ('COMMISSION_CREATED','COMMISSION',$1,$2,$3,$4,$5::jsonb)`,
        [commission.commissionId,sellerScope.region_id,sellerScope.team_id,actorUserId,JSON.stringify({commission_id:commission.commissionId,sale_id:saleId,beneficiary_user_id:commission.beneficiaryUserId,beneficiary_role:commission.beneficiaryRole,amount:commission.amount,policy_id:commission.policyId})],
      );
    }

    await tx.query(
      `insert into public.inventory_movements(imei_id,from_holder_user_id,requested_by,accepted_by,movement_type,requested_at,accepted_at,condition_before,condition_after,reason,notes)
       values ($1,$2,$3,$3,'TRANSFER',now(),now(),$4,$4,'SALE','IMEI transitioned to SOLD as part of completed sale')`,
      [line.imeiId,command.sellerUserId,actorUserId,imei.condition_status],
    );
    await tx.query(`update public.imei_units set state='SOLD',current_holder_user_id=null,current_warehouse_id=null,updated_at=now() where id=$1`,[line.imeiId]);
    await tx.query(
      `insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,request_id)
       values ($1,'SALE_COMPLETED','SALE',$2,$3::jsonb,current_setting('amaal.request_id',true))`,
      [actorUserId,saleId,JSON.stringify({sale_number:saleNumber,imei_id:line.imeiId,total_amount:Number(saleTotal),payment_number:paymentNumber})],
    );
    await tx.query(
      `insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,team_id,actor_user_id,payload)
       values ('SALE_COMPLETED','SALE',$1,$2,$3,$4,$5::jsonb)`,
      [saleId,sellerScope.region_id,sellerScope.team_id,actorUserId,JSON.stringify({sale_id:saleId,sale_number:saleNumber,imei_id:line.imeiId,payment_number:paymentNumber})],
    );

    return { saleId, saleNumber, receiptId: receiptRows[0]!.id };
  }
}
