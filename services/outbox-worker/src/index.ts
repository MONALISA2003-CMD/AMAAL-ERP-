import type { TransactionManager } from '@amaal/database';

export interface OutboxMessage {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  regionId: string | null;
  teamId: string | null;
  sequenceNumber: string;
  occurredAt: string;
  schemaVersion: number;
  actorUserId: string | null;
  payload: Record<string, unknown>;
}

export interface OutboxPublisher {
  publish(message: OutboxMessage): Promise<void>;
}

export class PostgresOutboxWorker {
  constructor(private readonly workerId: string, private readonly transactions: TransactionManager, private readonly publisher: OutboxPublisher) {}

  async runOnce(limit = 50): Promise<number> {
    const claimed = await this.transactions.withTransaction(
      { requestId: `outbox-claim-${this.workerId}`, actorUserId: this.workerId },
      async (tx) => tx.query<{
        id:string; event_type:string; aggregate_type:string; aggregate_id:string; region_id:string|null; team_id:string|null; sequence_number:string;
        occurred_at:string; schema_version:number; actor_user_id:string|null; payload:Record<string,unknown>;
      }>(
        `with claimable as (
           select id from public.outbox_events
           where published_at is null and next_attempt_at <= now()
             and (processing_at is null or processing_at < now() - interval '2 minutes')
           order by created_at for update skip locked limit $1
         )
         update public.outbox_events o
            set processing_at=now(),processing_by=$2,attempts=o.attempts+1
         from claimable c
         where o.id=c.id
         returning o.id,o.event_type,o.aggregate_type,o.aggregate_id,o.region_id,o.team_id,o.sequence_number,o.occurred_at,o.schema_version,o.actor_user_id,o.payload`,
        [limit,this.workerId],
      ),
    );

    for (const row of claimed) {
      const message: OutboxMessage = {
        id:row.id,eventType:row.event_type,aggregateType:row.aggregate_type,aggregateId:row.aggregate_id,
        regionId:row.region_id,teamId:row.team_id,sequenceNumber:row.sequence_number,occurredAt:row.occurred_at,schemaVersion:row.schema_version,
        actorUserId:row.actor_user_id,payload:row.payload,
      };
      try {
        await this.publisher.publish(message);
        await this.transactions.withTransaction(
          { requestId:`outbox-publish-${row.id}`, actorUserId:this.workerId },
          async (tx) => { await tx.query(`update public.outbox_events set published_at=now(),processing_at=null,processing_by=null,last_error=null where id=$1 and processing_by=$2`,[row.id,this.workerId]); return []; },
        );
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        await this.transactions.withTransaction(
          { requestId:`outbox-fail-${row.id}`, actorUserId:this.workerId },
          async (tx) => { await tx.query(`update public.outbox_events set processing_at=null,processing_by=null,last_error=$1,next_attempt_at=now() + make_interval(secs => least(power(2,greatest(attempts-1,0))::int,900)) where id=$2 and processing_by=$3`,[messageText,row.id,this.workerId]); return []; },
        );
      }
    }
    return claimed.length;
  }
}

export { PostgresRealtimePublisher, reconcileInventoryReadModel } from './projector.ts';
