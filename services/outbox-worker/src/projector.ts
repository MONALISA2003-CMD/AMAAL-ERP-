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
  const rows = await tx.query<{
    organization_id:string;
    sale_date:string;
    region_id:string|null;
    team_id:string|null;
    seller_user_id:string;
    total_amount:string;
    sale_units:string;
  }>(
    `select s.organization_id,coalesce(s.completed_at,s.created_at)::date as sale_date,s.region_id,s.team_id,s.seller_user_id,s.total_amount::text,coalesce(sum(si.quantity),0)::bigint::text as sale_units
     from public.sales s
     left join public.sale_items si on si.sale_id=s.id
     where s.id=$1
     group by s.id`,
    [message.eventType === 'SALE_REVERSED' ? message.aggregateId : (message.payload.sale_id as string ?? message.aggregateId)],
  );
  if (rows.length !== 1) return;
  const sale = rows[0]!;
  if (!sale.region_id || !sale.team_id) {
    throw new Error(`SALE projection ${message.id} is missing required region/team scope.`);
  }
  if (message.eventType === 'SALE_COMPLETED') {
    await tx.query(
      `insert into public.read_model_sales_daily(organization_id,sale_date,region_id,team_id,seller_user_id,units,revenue,updated_at)
       values ($1,$2,$3,$4,$5,$6::bigint,$7::numeric,now())
       on conflict (organization_id,sale_date,region_id,team_id,seller_user_id)
       do update set units=read_model_sales_daily.units+excluded.units,revenue=read_model_sales_daily.revenue+excluded.revenue,updated_at=now()`,
      [sale.organization_id,sale.sale_date,sale.region_id,sale.team_id,sale.seller_user_id,sale.sale_units,sale.total_amount],
    );
  } else {
    await tx.query(
      `insert into public.read_model_sales_daily(organization_id,sale_date,region_id,team_id,seller_user_id,reversed_units,reversed_revenue,updated_at)
       values ($1,$2,$3,$4,$5,$6::bigint,$7::numeric,now())
       on conflict (organization_id,sale_date,region_id,team_id,seller_user_id)
       do update set reversed_units=read_model_sales_daily.reversed_units+excluded.reversed_units,reversed_revenue=read_model_sales_daily.reversed_revenue+excluded.reversed_revenue,updated_at=now()`,
      [sale.organization_id,sale.sale_date,sale.region_id,sale.team_id,sale.seller_user_id,sale.sale_units,sale.total_amount],
    );
  }
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
