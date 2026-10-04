import type { DatabaseTransaction } from '@amaal/database';
import { authorize, loadAuthorizationContext } from '@amaal/permissions';
import { AuthorizationError, ValidationError } from '@amaal/shared';

function requirePermission(context: Awaited<ReturnType<typeof loadAuthorizationContext>>, permission: string): void {
  const decision = authorize(context, permission);
  if (!decision.allowed) throw new AuthorizationError(decision.reason);
}

export class PostgresReceiptService {
  async list(tx: DatabaseTransaction, actorUserId: string, limit = 100) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'receipts.view');
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return tx.query(`
      select r.id,r.receipt_number as "receiptNumber",r.sale_id as "saleId",s.sale_number as "saleNumber",
             r.issued_to_customer as "customerId",c.customer_number as "customerNumber",c.full_name as "customerName",
             r.issued_by as "issuedBy",p.display_name as "issuedByName",r.issued_at as "issuedAt",
             r.storage_reference as "storageReference",r.status,r.receipt_snapshot as "snapshot",r.generated_at as "generatedAt"
      from public.receipts r join public.sales s on s.id=r.sale_id join public.customers c on c.id=s.customer_id
      left join public.profiles p on p.user_id=r.issued_by
      where private.user_can_access_sale(r.sale_id)
      order by coalesce(r.issued_at,r.generated_at) desc limit $1
    `, [safeLimit]);
  }

  async get(tx: DatabaseTransaction, actorUserId: string, receiptId: string) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'receipts.view');
    const rows = await tx.query(`
      select r.id,r.receipt_number as "receiptNumber",r.sale_id as "saleId",s.sale_number as "saleNumber",
             r.issued_to_customer as "customerId",c.customer_number as "customerNumber",c.full_name as "customerName",
             r.issued_by as "issuedBy",p.display_name as "issuedByName",r.issued_at as "issuedAt",r.storage_reference as "storageReference",
             r.status,r.receipt_snapshot as "snapshot",r.generated_at as "generatedAt"
      from public.receipts r join public.sales s on s.id=r.sale_id join public.customers c on c.id=s.customer_id
      left join public.profiles p on p.user_id=r.issued_by
      where r.id=$1 and private.user_can_access_sale(r.sale_id)
    `, [receiptId]);
    if (rows.length !== 1) throw new ValidationError('Receipt not found or outside your organizational scope.');
    return rows[0];
  }
}
