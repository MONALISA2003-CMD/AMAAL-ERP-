import type { TransactionManager, DatabaseTransaction } from '@amaal/database';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import type { OutboxMessage, OutboxPublisher } from './index.ts';

async function consumeOnce(tx: DatabaseTransaction, consumerName: string, eventId: string): Promise<boolean> {
  const existing = await tx.query<{ id: string }>(
    `select id from public.consumer_receipts where consumer_name=$1 and event_id=$2 limit 1`,
    [consumerName, eventId],
  );
  if (existing.length) return false;
  await tx.query(
    `insert into public.consumer_receipts(consumer_name,event_id) values ($1,$2)`,
    [consumerName, eventId],
  );
  return true;
}

async function projectSalesDaily(tx: DatabaseTransaction, message: OutboxMessage): Promise<void> {
  if (message.eventType !== 'SALE_COMPLETED' && message.eventType !== 'SALE_REVERSED') return;
  const saleId = typeof message.payload.sale_id === 'string' ? message.payload.sale_id : message.aggregateId;
  const saleRows = await tx.query<{
    organization_id: string;
    sale_date: string;
    region_id: string;
    team_id: string;
    seller_user_id: string;
    total_amount: string;
  }>(
    `select s.organization_id,coalesce(s.completed_at,s.created_at)::date as sale_date,s.region_id,s.team_id,s.seller_user_id,s.total_amount::text
     from public.sales s where s.id=$1`, [saleId],
  );
  if (saleRows.length !== 1) return;
  const sale = saleRows[0]!;
  const itemCount = Number((await tx.query<{ n: string }>(
    `select count(*)::bigint::text as n from public.sale_items si where si.sale_id=$1 ${message.eventType === 'SALE_COMPLETED' ? `and si.is_active=true` : ''}`,
    [saleId],
  ))[0]?.n ?? '0');

  if (message.eventType === 'SALE_COMPLETED') {
    await tx.query(
      `insert into public.read_model_sales_daily(organization_id,sale_date,region_id,team_id,seller_user_id,units,revenue,transaction_count,updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,1,now())
       on conflict (organization_id,sale_date,region_id,team_id,seller_user_id)
       do update set units=read_model_sales_daily.units+excluded.units,
                     revenue=read_model_sales_daily.revenue+excluded.revenue,
                     transaction_count=read_model_sales_daily.transaction_count+1,
                     updated_at=now()`,
      [sale.organization_id,sale.sale_date,sale.region_id,sale.team_id,sale.seller_user_id,itemCount,sale.total_amount],
    );
    return;
  }

  await tx.query(
    `insert into public.read_model_sales_daily(organization_id,sale_date,region_id,team_id,seller_user_id,reversed_units,reversed_revenue,reversed_transaction_count,updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,1,now())
     on conflict (organization_id,sale_date,region_id,team_id,seller_user_id)
     do update set reversed_units=read_model_sales_daily.reversed_units+excluded.reversed_units,
                   reversed_revenue=read_model_sales_daily.reversed_revenue+excluded.reversed_revenue,
                   reversed_transaction_count=read_model_sales_daily.reversed_transaction_count+1,
                   updated_at=now()`,
    [sale.organization_id,sale.sale_date,sale.region_id,sale.team_id,sale.seller_user_id,itemCount,sale.total_amount],
  );
}

async function projectProductDaily(tx: DatabaseTransaction, message: OutboxMessage): Promise<void> {
  if (message.eventType !== 'SALE_COMPLETED' && message.eventType !== 'SALE_REVERSED') return;
  const saleId = typeof message.payload.sale_id === 'string' ? message.payload.sale_id : message.aggregateId;
  const sales = await tx.query<{ organization_id:string; sale_date:string; region_id:string; team_id:string; seller_user_id:string }>(
    `select organization_id,coalesce(completed_at,created_at)::date as sale_date,region_id,team_id,seller_user_id from public.sales where id=$1`, [saleId],
  );
  if (sales.length !== 1) return;
  const sale = sales[0]!;
  const items = await tx.query<{ product_variant_id:string; units:string; revenue:string }>(
    `select product_variant_id,count(*)::bigint::text as units,coalesce(sum(line_total),0)::numeric::text as revenue
     from public.sale_items where sale_id=$1 ${message.eventType === 'SALE_COMPLETED' ? `and is_active=true` : ''}
     group by product_variant_id`, [saleId],
  );
  for (const item of items) {
    if (message.eventType === 'SALE_COMPLETED') {
      await tx.query(
        `insert into public.read_model_product_daily(organization_id,sale_date,region_id,team_id,seller_user_id,product_variant_id,units,revenue,updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,now())
         on conflict (organization_id,sale_date,region_id,team_id,seller_user_id,product_variant_id)
         do update set units=read_model_product_daily.units+excluded.units,revenue=read_model_product_daily.revenue+excluded.revenue,updated_at=now()`,
        [sale.organization_id,sale.sale_date,sale.region_id,sale.team_id,sale.seller_user_id,item.product_variant_id,item.units,item.revenue],
      );
    } else {
      await tx.query(
        `insert into public.read_model_product_daily(organization_id,sale_date,region_id,team_id,seller_user_id,product_variant_id,reversed_units,reversed_revenue,updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,now())
         on conflict (organization_id,sale_date,region_id,team_id,seller_user_id,product_variant_id)
         do update set reversed_units=read_model_product_daily.reversed_units+excluded.reversed_units,reversed_revenue=read_model_product_daily.reversed_revenue+excluded.reversed_revenue,updated_at=now()`,
        [sale.organization_id,sale.sale_date,sale.region_id,sale.team_id,sale.seller_user_id,item.product_variant_id,item.units,item.revenue],
      );
    }
  }
}

async function projectCommissionDaily(tx: DatabaseTransaction, message: OutboxMessage): Promise<void> {
  if (message.eventType !== 'COMMISSION_CREATED' && message.eventType !== 'COMMISSION_ADJUSTED') return;
  const commissionId = message.aggregateId;
  const rows = await tx.query<{
    organization_id:string; sale_date:string; region_id:string; team_id:string; beneficiary_user_id:string; beneficiary_role:string|null; amount:string; adjustment_amount:string;
  }>(
    `select s.organization_id,coalesce(s.completed_at,s.created_at)::date as sale_date,s.region_id,s.team_id,c.beneficiary_user_id,coalesce(c.beneficiary_role::text,'UNKNOWN') as beneficiary_role,
       c.amount::numeric::text as amount,
       coalesce((select sum(a.amount) from public.commission_adjustments a where a.commission_id=c.id),0)::numeric::text as adjustment_amount
     from public.commissions c join public.sales s on s.id=c.sale_id where c.id=$1`, [commissionId],
  );
  if (rows.length !== 1) return;
  const row=rows[0]!;
  if (message.eventType === 'COMMISSION_CREATED') {
    await tx.query(
      `insert into public.read_model_commission_daily(organization_id,sale_date,region_id,team_id,beneficiary_user_id,beneficiary_role,gross_amount,adjustment_amount,net_amount,updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,0,$7,now())
       on conflict (organization_id,sale_date,region_id,team_id,beneficiary_user_id,beneficiary_role)
       do update set gross_amount=read_model_commission_daily.gross_amount+excluded.gross_amount,
                     net_amount=(read_model_commission_daily.gross_amount+excluded.gross_amount)-read_model_commission_daily.adjustment_amount,
                     updated_at=now()`,
      [row.organization_id,row.sale_date,row.region_id,row.team_id,row.beneficiary_user_id,row.beneficiary_role,row.amount],
    );
    return;
  }
  const adjustment = Number(row.adjustment_amount);
  await tx.query(
    `update public.read_model_commission_daily
     set adjustment_amount=$1,net_amount=gross_amount-$1,updated_at=now()
     where organization_id=$2 and sale_date=$3 and region_id=$4 and team_id=$5 and beneficiary_user_id=$6
       and beneficiary_role is not distinct from $7`,
    [adjustment,row.organization_id,row.sale_date,row.region_id,row.team_id,row.beneficiary_user_id,row.beneficiary_role],
  );
}


export class PostgresRealtimePublisher implements OutboxPublisher {
  private readonly redis: Redis | null;

  constructor(private readonly transactions: TransactionManager) {
    const url = process.env.AMAAL_VALKEY_URL?.trim() || process.env.REDIS_URL?.trim();
    this.redis = url ? new Redis(url, { maxRetriesPerRequest: null }) : null;
    this.redis?.on('error', (error) => console.error('[outbox] Valkey publisher error', error));
  }

  async publish(message: OutboxMessage): Promise<void> {
    const committed = await this.transactions.withTransaction(
      { requestId: `event-publish-${message.id}`, actorUserId: message.actorUserId ?? '00000000-0000-0000-0000-000000000000' },
      async (tx) => {
        const first = await consumeOnce(tx, 'realtime-delivery', message.id);
        if (!first) return false;

        await projectSalesDaily(tx, message);
        await projectProductDaily(tx, message);
        await projectCommissionDaily(tx, message);

        const recipientUserId = typeof message.payload.recipient_user_id === 'string' ? message.payload.recipient_user_id : null;
        await tx.query(
          `insert into public.realtime_events(source_event_id,sequence_number,event_type,aggregate_type,aggregate_id,region_id,team_id,actor_user_id,recipient_user_id,payload,occurred_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
           on conflict (source_event_id) do nothing`,
          [message.id,Number(message.sequenceNumber),message.eventType,message.aggregateType,message.aggregateId,
           message.regionId, message.teamId, message.actorUserId, recipientUserId,
           JSON.stringify(message.payload), message.occurredAt],
        );
        return true;
      },
    );

    if (!committed || !this.redis) return;
    const event = JSON.stringify({
      id: randomUUID(),
      sourceEventId: message.id,
      sequence: Number(message.sequenceNumber),
      eventType: message.eventType,
      aggregateType: message.aggregateType,
      aggregateId: message.aggregateId,
      regionId: message.regionId,
      teamId: message.teamId,
      actorUserId: message.actorUserId,
      recipientUserId: typeof message.payload.recipient_user_id === 'string' ? message.payload.recipient_user_id : null,
      payload: message.payload,
      occurredAt: message.occurredAt,
    });
    try {
      await this.redis.publish(process.env.AMAAL_REALTIME_CHANNEL?.trim() || 'amaal:realtime', event);
    } catch (error) {
      console.error('[outbox] realtime fanout failed; durable Neon replay remains available', error);
    }
  }

  async close(): Promise<void> {
    if (!this.redis) return;
    await this.redis.quit().catch(() => this.redis?.disconnect());
  }
}

export async function reconcileInventoryReadModel(
  transactions: TransactionManager,
  requestId = `inventory-reconcile-${Date.now()}`,
): Promise<void> {
  await transactions.withTransaction(
    { requestId, actorUserId: '00000000-0000-0000-0000-000000000000' },
    async (tx) => {
      await tx.query(`delete from public.read_model_inventory_current`);
      await tx.query(
        `insert into public.read_model_inventory_current(organization_id,region_id,team_id,holder_user_id,state,units,updated_at)
         select b.organization_id,
                i.current_region_id,
                i.current_team_id,
                i.current_holder_user_id,
                i.state,
                count(*)::bigint,
                now()
         from public.imei_units i
         join public.product_variants pv on pv.id=i.product_variant_id
         join public.products p on p.id=pv.product_id
         join public.brands b on b.id=p.brand_id
         where i.state in ('ALLOCATED_TO_MANAGER','ALLOCATED_TO_TEAM','ALLOCATED_TO_AGENT','ALLOCATED_TO_SHOP','RECOVERY_PENDING','RECOVERED','DAMAGED','LOST','QUARANTINE','TRANSFER_PENDING')
           and i.current_region_id is not null
           and i.current_team_id is not null
           and i.current_holder_user_id is not null
         group by b.organization_id,i.current_region_id,i.current_team_id,i.current_holder_user_id,i.state`,
      );
      return [];
    },
  );
}
