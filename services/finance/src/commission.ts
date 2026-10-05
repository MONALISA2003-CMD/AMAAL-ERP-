import type { DatabaseTransaction } from '@amaal/database';
import type { RoleKey } from '@amaal/permissions';
import { ValidationError, DomainError } from '@amaal/shared';
import { calculateCommissionAmount, type CommissionRuleDefinition } from './commission-rules.ts';
import { policyConditionsMatch } from './phase4-finance-rules.ts';

export type CommissionOutcome = {
  commissionId: string;
  policyId: string;
  beneficiaryUserId: string;
  beneficiaryRole: RoleKey;
  amount: number;
};

function parseRule(value: unknown): CommissionRuleDefinition {
  if (!value || typeof value !== 'object') throw new ValidationError('Commission policy rule_definition must be an object.');
  const rule = value as Record<string, unknown>;
  const calculationType = rule.calculation_type;
  if (calculationType !== 'FIXED_AMOUNT' && calculationType !== 'PERCENT_OF_SALE') {
    throw new ValidationError(`Unsupported commission calculation_type: ${String(calculationType)}.`);
  }
  if (calculationType === 'FIXED_AMOUNT') {
    const amount = Number(rule.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new ValidationError('FIXED_AMOUNT commission requires a non-negative amount.');
    return { calculation_type: calculationType, amount };
  }
  const rate = Number(rule.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new ValidationError('PERCENT_OF_SALE commission requires a rate between 0 and 100.');
  return { calculation_type: calculationType, rate };
}

export async function createDirectSellerCommission(
  tx: DatabaseTransaction,
  input: { saleId: string; saleAmount: number; productVariantId: string; sellerUserId: string; organizationId: string; paymentType?: 'CASH'|'LOAN' },
): Promise<CommissionOutcome | null> {
  const roles = await tx.query<{ role: RoleKey }>(
    `select role from public.role_assignments where user_id=$1 and status='ACTIVE' and (effective_to is null or effective_to > now()) order by case role when 'SHOP_OWNER' then 1 when 'AGENT' then 2 when 'TEAM_LEADER' then 3 when 'MANAGER' then 4 when 'REGIONAL_MANAGER' then 5 when 'ADMIN' then 6 else 7 end limit 1`,
    [input.sellerUserId],
  );
  if (roles.length !== 1) return null;
  const sellerRole = roles[0]!.role;

  const policies = await tx.query<{ id:string; role:RoleKey|null; product_variant_id:string|null; rule_definition:Record<string, unknown>; conditions:Record<string, unknown>; effective_from:string }>(
    `select id,role,product_variant_id,rule_definition,conditions,effective_from
     from public.commission_policies
     where organization_id=$1 and status='ACTIVE'
       and effective_from <= now() and (effective_to is null or effective_to > now())
       and (role is null or role=$2)
       and (product_variant_id is null or product_variant_id=$3)
     order by
       case when product_variant_id=$3 and role=$2 then 0
            when product_variant_id=$3 and role is null then 1
            when product_variant_id is null and role=$2 then 2
            else 3 end,
       effective_from desc
     limit 25`,
    [input.organizationId, sellerRole, input.productVariantId],
  );
  const policy = policies.find((candidate) => policyConditionsMatch({ conditions: candidate.conditions, saleAmount: input.saleAmount, ...(input.paymentType ? { paymentType: input.paymentType } : {}) }));
  if (!policy) return null;
  const rule = parseRule(policy.rule_definition);
  let amount: number;
  try { amount = calculateCommissionAmount(rule, input.saleAmount); } catch (error) {
    if (error instanceof RangeError) throw new ValidationError(error.message);
    throw error;
  }
  if (amount < 0) throw new DomainError('Calculated commission cannot be negative.', 'COMMISSION_CALCULATION_INVALID');

  const rows = await tx.query<{ id:string }>(
    `insert into public.commissions(sale_id,beneficiary_user_id,beneficiary_role,policy_id,amount,policy_snapshot)
     values ($1,$2,$3,$4,$5::numeric,$6::jsonb) returning id`,
    [input.saleId,input.sellerUserId,sellerRole,policy.id,amount,JSON.stringify({
      policy_id:policy.id,
      effective_from:policy.effective_from,
      role:sellerRole,
      product_variant_id:input.productVariantId,
      rule_definition:policy.rule_definition,
      conditions:policy.conditions ?? {},
      sale_amount:input.saleAmount,
      payment_type:input.paymentType ?? null,
    })],
  );
  if (rows.length !== 1) throw new DomainError('Commission could not be recorded.', 'COMMISSION_CREATE_FAILED');
  return { commissionId: rows[0]!.id, policyId: policy.id, beneficiaryUserId: input.sellerUserId, beneficiaryRole: sellerRole, amount };
}
