import { randomUUID } from 'node:crypto';
import type { DatabaseTransaction } from '@amaal/database';
import { AuthorizationError, ConflictError, DomainError, ValidationError } from '@amaal/shared';
import { authorize, loadAuthorizationContext, type RoleKey } from '@amaal/permissions';
import { validateCreateSale, type CreateSaleCommand, type SaleLineCommand } from './index.ts';
import { createDirectSellerCommission, evaluateBonusesForSale, saleLineAmountsAreValid, validateSalePaymentContract } from '@amaal/finance';

interface ImeiRow {
  id: string;
  imei: string;
  product_variant_id: string;
  state: string;
  current_holder_user_id: string | null;
  current_warehouse_id: string | null;
  current_region_id: string | null;
  current_team_id: string | null;
  current_shop_id: string | null;
  condition_status: string;
}

interface CustomerRow {
  id: string;
  created_by: string;
  owner_user_id: string;
  region_id: string | null;
  team_id: string | null;
  shop_id: string | null;
}

interface PricePolicyRow {
  id: string;
  selling_price: string;
  minimum_price: string;
  discount_limit: string;
  effective_from: string;
  effective_to: string | null;
}

interface SellerScopeRow {
  region_id: string | null;
  team_id: string | null;
  shop_id: string | null;
  manager_user_id: string | null;
}

function amount(value: number): number {
  if (!Number.isFinite(value)) throw new ValidationError('Monetary value must be finite.');
  return Number(value.toFixed(2));
}

function assertSaleEligibility(state: string): void {
  if (!new Set(['ALLOCATED_TO_MANAGER','ALLOCATED_TO_TEAM','ALLOCATED_TO_AGENT','ALLOCATED_TO_SHOP']).has(state)) {
    throw new ConflictError(`IMEI cannot be sold from state ${state}.`);
  }
}

function salesRole(roles: RoleKey[]): RoleKey | null {
  const priority: RoleKey[] = ['SHOP_OWNER','AGENT','TEAM_LEADER','MANAGER','REGIONAL_MANAGER','ADMIN','CEO','RECOVERY_OFFICER'];
  return priority.find((role) => roles.includes(role)) ?? null;
}

function generateNumber(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomUUID().slice(0,8).toUpperCase()}`;
}

export class PostgresSaleService {
  async createAndCompleteSale(tx: DatabaseTransaction, actorUserId: string, command: CreateSaleCommand): Promise<{ saleId: string; saleNumber: string; receiptId: string; paymentNumber: string | null; totalAmount: number; amountPaid: number; balance: number }> {
    validateCreateSale(command);

    const context = await loadAuthorizationContext(tx, actorUserId);
    const sellerDecision = authorize(context, 'sales.create', { ownerUserId: command.sellerUserId });
    if (!sellerDecision.allowed) throw new AuthorizationError(sellerDecision.reason);
    if (command.sellerUserId !== actorUserId && !context.roles.some((role) => ['CEO','ADMIN','MANAGER','TEAM_LEADER'].includes(role))) {
      throw new AuthorizationError('Only privileged organizational roles may record a sale for another seller.');
    }

    const customerRows = await tx.query<CustomerRow>(
      `select c.id,c.created_by,c.owner_user_id,c.region_id,c.team_id,c.shop_id
       from public.customers c
       where c.id=$1 and c.status='ACTIVE' and private.user_can_access_customer(c.id)
       for share`,
      [command.customerId],
    );
    if (customerRows.length !== 1) throw new ValidationError('Customer not found, inactive, or outside the seller organizational scope.');
    const customer = customerRows[0]!;
    const customerDecision = authorize(context, 'customers.view', {
      ownerUserId: customer.owner_user_id,
      ...(customer.shop_id ? { shopId: customer.shop_id } : {}),
      ...(customer.team_id ? { teamId: customer.team_id } : {}),
      ...(customer.region_id ? { regionId: customer.region_id } : {}),
    });
    if (!customerDecision.allowed) throw new AuthorizationError('Customer is outside the seller organizational scope.');

    const sellerRole = salesRole(context.roles);
    if (!sellerRole) throw new AuthorizationError('Seller has no supported sales role.');

    const sellerScopes = await tx.query<SellerScopeRow>(
      `select coalesce(tm_region.region_id, m.region_id, ra.region_id, i.current_region_id) as region_id,
              coalesce(tm_region.team_id, ra.team_id, i.current_team_id) as team_id,
              coalesce(tm_region.shop_id, ra.shop_id, i.current_shop_id) as shop_id,
              coalesce(t.manager_user_id, m.user_id) as manager_user_id
       from public.imei_units i
       left join lateral (
         select tm.team_id,tm.shop_id,t.region_id, t.manager_user_id
         from public.team_memberships tm
         join public.teams t on t.id=tm.team_id
         where tm.user_id=$1 and tm.status='ACTIVE' and (tm.effective_to is null or tm.effective_to>now())
         order by case when tm.role='SHOP_OWNER' then 0 else 1 end, tm.effective_from desc
         limit 1
       ) tm_region on true
       left join public.managers m on m.user_id=$1 and m.status='ACTIVE'
       left join lateral (
         select ra.region_id,ra.team_id,ra.shop_id
         from public.role_assignments ra
         where ra.user_id=$1 and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to>now())
         order by case when ra.team_id is not null then 0 when ra.region_id is not null then 1 else 2 end
         limit 1
       ) ra on true
       where i.id=$2
       limit 1`,
      [command.sellerUserId, command.lines[0]!.imeiId],
    );
    const sellerScope = sellerScopes[0] ?? { region_id: null, team_id: null, shop_id: null, manager_user_id: null };

    const prepared: Array<{
      line: SaleLineCommand;
      imei: ImeiRow;
      policy: PricePolicyRow;
      finalPrice: number;
      discount: number;
      listPrice: number;
    }> = [];

    for (const line of command.lines) {
      const imeiRows = await tx.query<ImeiRow>(
        `select id,imei,product_variant_id,state,current_holder_user_id,current_warehouse_id,current_region_id,current_team_id,current_shop_id,condition_status
         from public.imei_units where id=$1 for update`,
        [line.imeiId],
      );
      if (imeiRows.length !== 1) throw new ValidationError(`IMEI ${line.imeiId} was not found.`);
      const imei = imeiRows[0]!;
      assertSaleEligibility(imei.state);
      if (imei.current_holder_user_id !== command.sellerUserId) throw new AuthorizationError(`Seller is not the accountable holder of IMEI ${imei.imei}.`);
      if (imei.product_variant_id !== line.productVariantId) throw new ValidationError(`Product variant does not match IMEI ${imei.imei}.`);
      const policyRows = await tx.query<PricePolicyRow>(
        `select id,selling_price::text,minimum_price::text,discount_limit::text,effective_from,effective_to
         from public.price_policies
         where product_variant_id=$1 and status='ACTIVE' and effective_from<=now() and (effective_to is null or effective_to>now())
         order by effective_from desc limit 1`,
        [line.productVariantId],
      );
      if (policyRows.length !== 1) throw new ValidationError(`No active price policy exists for IMEI ${imei.imei}.`);
      const policy = policyRows[0]!;
      // API unitPrice is the customer-facing final unit price; the persisted list price is final + discount.
      const finalPrice = amount(line.unitPrice);
      const discount = amount(line.discountAmount ?? 0);
      const listPrice = amount(finalPrice + discount);
      const sellingPrice = Number(policy.selling_price);
      const minimumPrice = Number(policy.minimum_price);
      const discountLimit = Number(policy.discount_limit);
      if (listPrice > sellingPrice) throw new ValidationError(`List price for ${imei.imei} exceeds the active selling price policy.`);
      try {
        saleLineAmountsAreValid({ listPrice, discountAmount: discount, finalPrice, minimumPrice, discountLimit });
      } catch (error) {
        throw new ValidationError(error instanceof Error ? `${imei.imei}: ${error.message}` : `Invalid finance values for ${imei.imei}.`);
      }
      const first = prepared[0];
      if (first) {
        const firstScope = [first.imei.current_region_id, first.imei.current_team_id, first.imei.current_shop_id].map((value) => value ?? '').join('|');
        const currentScope = [imei.current_region_id, imei.current_team_id, imei.current_shop_id].map((value) => value ?? '').join('|');
        if (firstScope !== currentScope) {
          throw new ValidationError('All IMEIs in one sale must resolve to the same region, team and shop custody scope.');
        }
      }
      prepared.push({ line, imei, policy, finalPrice, discount, listPrice });
    }

    const subtotal = amount(prepared.reduce((sum, x) => sum + x.listPrice, 0));
    const discountTotal = amount(prepared.reduce((sum, x) => sum + x.discount, 0));
    const totalAmount = amount(prepared.reduce((sum, x) => sum + x.finalPrice, 0));

    let amountPaid = totalAmount;
    let balance = 0;
    let deposit = totalAmount;
    let financed = 0;
    let loanProviderName: string | null = null;

    if (command.paymentType === 'CASH') {
      try {
        validateSalePaymentContract({ paymentType: command.paymentType, totalAmount, depositAmount: deposit, financedAmount: financed });
      } catch (error) {
        throw new ValidationError(error instanceof Error ? error.message : 'Invalid cash sale finance contract.');
      }
    }

    if (command.paymentType === 'LOAN') {
      deposit = amount(command.depositAmount ?? 0);
      financed = amount(command.financedAmount ?? amount(totalAmount - deposit));
      try {
        validateSalePaymentContract({ paymentType: command.paymentType, totalAmount, depositAmount: deposit, financedAmount: financed, loanProviderId: command.loanProviderId, loanReference: command.loanReference });
      } catch (error) {
        throw new ValidationError(error instanceof Error ? error.message : 'Invalid loan sale finance contract.');
      }
      const organizationRows = await tx.query<{ organization_id:string }>(`select organization_id from public.profiles where user_id=$1 and status='ACTIVE'`,[command.sellerUserId]);
      if (organizationRows.length !== 1) throw new ValidationError('Seller organization could not be resolved.');
      const organizationIdForLoan = organizationRows[0]!.organization_id;
      const providerRows = await tx.query<{ id:string; provider_name:string }>(`select id,provider_name from public.loan_providers where id=$1 and organization_id=$2 and status='ACTIVE'`,[command.loanProviderId,organizationIdForLoan]);
      if (providerRows.length !== 1) throw new ValidationError('Loan provider was not found or is inactive.');
      loanProviderName = providerRows[0]!.provider_name;
      amountPaid = deposit;
      balance = financed;
    }

    const organizationRows = await tx.query<{ organization_id:string }>(`select organization_id from public.profiles where user_id=$1 and status='ACTIVE'`,[command.sellerUserId]);
    if (organizationRows.length !== 1) throw new ValidationError('Seller organization could not be resolved.');
    const organizationId = organizationRows[0]!.organization_id;
    const saleNumber = generateNumber('SAL');
    const receiptNumber = generateNumber('RCT');

    const saleRows = await tx.query<{ id:string }>(
      `insert into public.sales(organization_id,sale_number,seller_user_id,customer_id,status,payment_type,subtotal,discount_amount,total_amount,team_id,manager_user_id,region_id,amount_paid,balance,sale_datetime,completed_at,external_reference,loan_provider_id,loan_reference,deposit_amount,financed_amount)
       values($1,$2,$3,$4,'COMPLETED',$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),now(),$14,$15,$16,$17,$18) returning id`,
      [organizationId,saleNumber,command.sellerUserId,command.customerId,command.paymentType,subtotal,discountTotal,totalAmount,sellerScope.team_id,sellerScope.manager_user_id,sellerScope.region_id,amountPaid,balance,command.externalPaymentReference?.trim()||null,command.loanProviderId??null,command.loanReference?.trim()||null,deposit,financed],
    );
    if (saleRows.length !== 1) throw new DomainError('Could not create sale.', 'SALE_CREATE_FAILED');
    const saleId = saleRows[0]!.id;

    for (const preparedLine of prepared) {
      const snapshot = {
        policyId: preparedLine.policy.id,
        effectiveFrom: preparedLine.policy.effective_from,
        effectiveTo: preparedLine.policy.effective_to,
        sellingPrice: Number(preparedLine.policy.selling_price),
        minimumPrice: Number(preparedLine.policy.minimum_price),
        discountLimit: Number(preparedLine.policy.discount_limit),
        listPrice: preparedLine.listPrice,
        discountAmount: preparedLine.discount,
        finalPrice: preparedLine.finalPrice,
      };
      const saleItemRows = await tx.query<{ id:string }>(
        `insert into public.sale_items(sale_id,imei_id,product_variant_id,quantity,unit_price,discount_amount,final_price,applied_price_policy_id,price_snapshot,line_total,pre_sale_state,pre_sale_holder_user_id,pre_sale_warehouse_id,pre_sale_region_id,pre_sale_team_id,pre_sale_shop_id)
         values($1,$2,$3,1,$4,$5,$6,$7,$8::jsonb,$6,$9,$10,$11,$12,$13,$14) returning id`,
        [saleId,preparedLine.imei.id,preparedLine.line.productVariantId,preparedLine.listPrice,preparedLine.discount,preparedLine.finalPrice,preparedLine.policy.id,JSON.stringify(snapshot),preparedLine.imei.state,preparedLine.imei.current_holder_user_id,preparedLine.imei.current_warehouse_id,preparedLine.imei.current_region_id,preparedLine.imei.current_team_id,preparedLine.imei.current_shop_id],
      );
      if (saleItemRows.length !== 1) throw new DomainError('Could not create sale item.', 'SALE_ITEM_CREATE_FAILED');

      await tx.query(
        `insert into public.inventory_movements(imei_id,from_holder_user_id,from_team_id,from_shop_id,requested_by,accepted_by,movement_type,requested_at,accepted_at,condition_before,condition_after,reason,notes)
         values($1,$2,$3,$4,$5,$5,'TRANSFER',now(),now(),$6,$6,'SALE','IMEI transitioned to SOLD as part of completed sale')`,
        [preparedLine.imei.id,command.sellerUserId,preparedLine.imei.current_team_id,preparedLine.imei.current_shop_id,actorUserId,preparedLine.imei.condition_status],
      );
      await tx.query(`update public.imei_units set state='SOLD',current_holder_user_id=null,current_warehouse_id=null,current_region_id=null,current_team_id=null,current_shop_id=null,updated_at=now() where id=$1`,[preparedLine.imei.id]);

      const commission = await createDirectSellerCommission(tx,{saleId,saleAmount:preparedLine.finalPrice,productVariantId:preparedLine.line.productVariantId,sellerUserId:command.sellerUserId,organizationId,paymentType:command.paymentType});
      if (commission) {
        await tx.query(`update public.sale_items set commission_policy_id=$1 where id=$2`,[commission.policyId,saleItemRows[0]!.id]);
        await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,team_id,actor_user_id,payload) values('COMMISSION_CREATED','COMMISSION',$1,$2,$3,$4,$5::jsonb)`,[commission.commissionId,sellerScope.region_id,sellerScope.team_id,actorUserId,JSON.stringify({...commission,sale_id:saleId})]);
      }
    }

    let paymentNumber: string | null = null;
    if (command.paymentType === 'CASH' || deposit > 0) {
      paymentNumber = generateNumber('PAY');
      await tx.query(
        `insert into public.payments(payment_number,sale_id,customer_id,payment_type,method,amount,status,external_reference,reference,paid_at,received_at,recorded_by,received_by)
         values($1,$2,$3,$4,$5,$6,'COMPLETED',$7,$7,now(),now(),$8,$8)`,
        [paymentNumber,saleId,command.customerId,command.paymentType,command.paymentMethod?.trim() || (command.paymentType==='CASH'?'CASH':'LOAN_DEPOSIT'),deposit,command.externalPaymentReference?.trim()||null,actorUserId],
      );
    }

    if (command.paymentType === 'LOAN') {
      await tx.query(
        `insert into public.receivables(sale_id,provider,loan_provider_id,loan_reference,deposit_amount,financed_amount,outstanding_amount,status,due_at,loan_status)
         values($1,$2,$3,$4,$5,$6,$6,'OPEN',$7,'ACTIVE')`,
        [saleId,loanProviderName,command.loanProviderId,command.loanReference?.trim(),deposit,financed,command.dueAt?.trim()||null],
      );
    }

    const receiptSnapshot = await tx.query<{ snapshot: Record<string,unknown> }>(
      `select json_build_object(
        'receiptNumber',$1,'saleNumber',$2,'dateTime',s.sale_datetime,'seller',sp.display_name,'sellerUserId',s.seller_user_id,
        'team',t.team_name,'manager',mp.display_name,'region',r.region_name,
        'customer',json_build_object('customerNumber',c.customer_number,'fullName',c.full_name,'phone',c.phone,'email',c.email),
        'items',coalesce((select json_agg(json_build_object('imei',i.imei,'imei2',i.imei_2,'productVariantId',si.product_variant_id,'brand',b.brand_name,'model',p.model_name,'sku',pv.sku,'sellingPrice',si.unit_price,'discount',si.discount_amount,'finalPrice',si.final_price,'warranty',pv.warranty_text) order by si.created_at) from public.sale_items si join public.imei_units i on i.id=si.imei_id join public.product_variants pv on pv.id=si.product_variant_id join public.products p on p.id=pv.product_id join public.brands b on b.id=p.brand_id where si.sale_id=s.id),'[]'::json),
        'subtotal',s.subtotal,'discount',s.discount_amount,'total',s.total_amount,'amountPaid',s.amount_paid,'balance',s.balance,'paymentType',s.payment_type,
        'paymentReference',coalesce((select pmt.reference from public.payments pmt where pmt.sale_id=s.id order by pmt.paid_at desc limit 1),s.external_reference),
        'loanProvider',$3,'loanReference',s.loan_reference,'depositAmount',s.deposit_amount,'financedAmount',s.financed_amount
      ) as snapshot
      from public.sales s join public.profiles sp on sp.user_id=s.seller_user_id join public.customers c on c.id=s.customer_id
      left join public.teams t on t.id=s.team_id left join public.profiles mp on mp.user_id=s.manager_user_id left join public.regions r on r.id=s.region_id
      where s.id=$4`,
      [receiptNumber,saleNumber,loanProviderName,saleId],
    );
    if (receiptSnapshot.length !== 1) throw new DomainError('Receipt snapshot could not be generated.','RECEIPT_SNAPSHOT_FAILED');
    const receiptRows = await tx.query<{id:string}>(`insert into public.receipts(receipt_number,sale_id,generated_by,issued_by,issued_to_customer,issued_at,receipt_snapshot,status) values($1,$2,$3,$3,$4,now(),$5::jsonb,'ISSUED') returning id`,[receiptNumber,saleId,actorUserId,command.customerId,JSON.stringify(receiptSnapshot[0]!.snapshot)]);
    if(receiptRows.length!==1) throw new DomainError('Could not create receipt.','RECEIPT_CREATE_FAILED');

    await evaluateBonusesForSale(tx,{organizationId,beneficiaryUserId:command.sellerUserId,saleId,totalAmount,saleDate:new Date()});

    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id) values($1,'SALE_COMPLETED','SALE',$2,$3::jsonb,'Phase 4 authoritative sale transaction',current_setting('amaal.request_id',true))`,[actorUserId,saleId,JSON.stringify({saleNumber,lines:prepared.length,totalAmount,amountPaid,balance,paymentType:command.paymentType})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,team_id,actor_user_id,payload) values('SALE_COMPLETED','SALE',$1,$2,$3,$4,$5::jsonb)`,[saleId,sellerScope.region_id,sellerScope.team_id,actorUserId,JSON.stringify({sale_id:saleId,sale_number:saleNumber,receipt_id:receiptRows[0]!.id,payment_number:paymentNumber,total_amount:totalAmount,amount_paid:amountPaid,balance})]);

    return { saleId, saleNumber, receiptId: receiptRows[0]!.id, paymentNumber, totalAmount, amountPaid, balance };
  }
}
