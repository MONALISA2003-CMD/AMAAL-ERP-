import { randomUUID } from 'node:crypto';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { AuthorizationContext } from '@amaal/permissions';
import { loadAuthorizationContext } from '@amaal/permissions';
import { authenticateBearerToken } from '@amaal/auth';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import Redis from 'ioredis';
import type { ApiServices } from './index.ts';

export type DurableRealtimeEvent = {
  id: string;
  sourceEventId: string;
  sequence: number;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  regionId: string | null;
  teamId: string | null;
  actorUserId: string | null;
  recipientUserId: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
};

type Client = {
  socket: WebSocket;
  userId: string;
  context: AuthorizationContext;
  lastSequence: number;
};

const CHANNEL = process.env.AMAAL_REALTIME_CHANNEL?.trim() || 'amaal:realtime';
const MAX_REPLAY = 250;

function valkeyUrl(): string | null {
  return process.env.AMAAL_VALKEY_URL?.trim() || process.env.REDIS_URL?.trim() || null;
}

function originAllowed(origin: string | undefined): boolean {
  const raw = process.env.AMAAL_WEB_ORIGIN?.trim();
  if (!raw || !origin) return true;
  return raw.split(',').map((item) => item.trim()).filter(Boolean).includes(origin);
}

function extractBearerFromProtocols(value: string | undefined): string | null {
  if (!value) return null;
  const protocols = value.split(',').map((item) => item.trim());
  if (protocols[0] !== 'amaal.v1') return null;
  return protocols[1] || null;
}

function adminRealtimePermission(eventType: string, aggregateType: string): string {
  const type = eventType.toUpperCase();
  const aggregate = aggregateType.toUpperCase();
  if (type.startsWith('STOCK_') || type.startsWith('IMEI_') || aggregate.includes('INVENTORY') || aggregate.includes('IMEI') || aggregate.includes('STOCK')) return 'inventory.view';
  if (type.startsWith('SALE_') || type.startsWith('PAYMENT_') || type.startsWith('RECEIPT_') || aggregate.includes('SALE') || aggregate.includes('PAYMENT') || aggregate.includes('RECEIPT')) return 'sales.view';
  if (type.startsWith('COMMISSION_') || type.startsWith('BONUS_') || aggregate.includes('COMMISSION') || aggregate.includes('BONUS')) return 'commissions.view';
  if (type.startsWith('RECOVERY_') || type.startsWith('STOCK_OVERDUE') || type.startsWith('STOCK_APPROACHING_') || aggregate.includes('RECOVERY')) return 'recovery.view';
  if (type.startsWith('APPROVAL_') || aggregate.includes('APPROVAL')) return 'approvals.view';
  if (type.startsWith('USER_') || type.startsWith('ROLE_') || type.startsWith('TEAM_') || type.startsWith('REGION_') || type.startsWith('ORGANIZATION_') || type.includes('IDENTITY') || aggregate.includes('USER') || aggregate.includes('ROLE') || aggregate.includes('TEAM') || aggregate.includes('REGION')) return 'users.view';
  return 'reports.view';
}

export function canReceiveRealtimeEvent(
  context: AuthorizationContext,
  event: Pick<DurableRealtimeEvent, 'regionId' | 'teamId' | 'actorUserId' | 'recipientUserId'> & Partial<Pick<DurableRealtimeEvent, 'eventType' | 'aggregateType'>>,
): boolean {
  if (context.roles.includes('CEO')) return true;
  if (context.roles.includes('ADMIN') && !context.permissions.includes(adminRealtimePermission(event.eventType ?? '', event.aggregateType ?? ''))) return false;
  if (event.recipientUserId === context.userId || event.actorUserId === context.userId) return true;
  if (event.regionId && context.regionIds.includes(event.regionId)) return true;
  if (event.teamId && context.teamIds.includes(event.teamId)) return true;
  return false;
}

async function loadReplay(services: ApiServices, context: AuthorizationContext, after: number, limit: number): Promise<DurableRealtimeEvent[]> {
  const ceiling = Math.min(Math.max(limit, 1), MAX_REPLAY);
  const values: unknown[] = [after];
  const scopeClauses = ['re.sequence_number > $1'];
  const param = (value: unknown) => { values.push(value); return `$${values.length}`; };

  if (context.roles.includes('CEO')) {
    // company-wide
  } else if (context.roles.includes('ADMIN')) {
    const inventory = param(context.permissions.includes('inventory.view'));
    const sales = param(context.permissions.includes('sales.view'));
    const commission = param(context.permissions.includes('commissions.view'));
    const recovery = param(context.permissions.includes('recovery.view'));
    const approvals = param(context.permissions.includes('approvals.view'));
    const users = param(context.permissions.includes('users.view'));
    const reports = param(context.permissions.includes('reports.view'));
    scopeClauses.push(`(
      (${inventory} and (re.event_type like 'STOCK_%' or re.event_type like 'IMEI_%' or re.aggregate_type ilike '%INVENTORY%' or re.aggregate_type ilike '%IMEI%' or re.aggregate_type ilike '%STOCK%')) or
      (${sales} and (re.event_type like 'SALE_%' or re.event_type like 'PAYMENT_%' or re.event_type like 'RECEIPT_%' or re.aggregate_type ilike '%SALE%' or re.aggregate_type ilike '%PAYMENT%' or re.aggregate_type ilike '%RECEIPT%')) or
      (${commission} and (re.event_type like 'COMMISSION_%' or re.event_type like 'BONUS_%' or re.aggregate_type ilike '%COMMISSION%' or re.aggregate_type ilike '%BONUS%')) or
      (${recovery} and (re.event_type like 'RECOVERY_%' or re.event_type like 'STOCK_OVERDUE' or re.event_type like 'STOCK_APPROACHING_%' or re.aggregate_type ilike '%RECOVERY%')) or
      (${approvals} and (re.event_type like 'APPROVAL_%' or re.aggregate_type ilike '%APPROVAL%')) or
      (${users} and (re.event_type like 'USER_%' or re.event_type like 'ROLE_%' or re.event_type like 'TEAM_%' or re.event_type like 'REGION_%' or re.event_type like 'ORGANIZATION_%' or re.event_type ilike '%IDENTITY%' or re.aggregate_type ilike '%USER%' or re.aggregate_type ilike '%ROLE%' or re.aggregate_type ilike '%TEAM%' or re.aggregate_type ilike '%REGION%')) or
      (${reports} and not (re.event_type like 'STOCK_%' or re.event_type like 'IMEI_%' or re.event_type like 'SALE_%' or re.event_type like 'PAYMENT_%' or re.event_type like 'RECEIPT_%' or re.event_type like 'COMMISSION_%' or re.event_type like 'BONUS_%' or re.event_type like 'RECOVERY_%' or re.event_type like 'STOCK_OVERDUE' or re.event_type like 'STOCK_APPROACHING_%' or re.event_type like 'APPROVAL_%' or re.event_type like 'USER_%' or re.event_type like 'ROLE_%' or re.event_type like 'TEAM_%' or re.event_type like 'REGION_%' or re.event_type like 'ORGANIZATION_%' or re.event_type ilike '%IDENTITY%'))
    )`);
  } else {
    const recipient = param(context.userId);
    const regions = param(context.regionIds);
    const teams = param(context.teamIds);
    scopeClauses.push(`(re.recipient_user_id = ${recipient} OR re.actor_user_id = ${recipient} OR re.region_id = ANY(${regions}::uuid[]) OR re.team_id = ANY(${teams}::uuid[]))`);
  }

  const rows = await services.pool.query<{
    id: string;
    source_event_id: string;
    sequence_number: string;
    event_type: string;
    aggregate_type: string;
    aggregate_id: string;
    region_id: string | null;
    team_id: string | null;
    actor_user_id: string | null;
    recipient_user_id: string | null;
    payload: Record<string, unknown>;
    occurred_at: string;
  }>({
    text: `select id, source_event_id, sequence_number, event_type, aggregate_type, aggregate_id, region_id, team_id, actor_user_id, recipient_user_id, payload, occurred_at
           from public.realtime_events re
           where ${scopeClauses.join(' and ')}
           order by sequence_number asc
           limit ${ceiling}`,
    values,
  } as any);

  return rows.map((row) => ({
    id: row.id,
    sourceEventId: row.source_event_id,
    sequence: Number(row.sequence_number),
    eventType: row.event_type,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    regionId: row.region_id,
    teamId: row.team_id,
    actorUserId: row.actor_user_id,
    recipientUserId: row.recipient_user_id,
    payload: row.payload,
    occurredAt: row.occurred_at,
  }));
}

export async function listRealtimeEvents(services: ApiServices, context: AuthorizationContext, after: number, limit: number): Promise<{ items: DurableRealtimeEvent[]; latestSequence: number }> {
  const items = await loadReplay(services, context, after, limit);
  const latest = await services.pool.query<{ sequence_number: string | null }>('select max(sequence_number)::text as sequence_number from public.realtime_events');
  return { items, latestSequence: latest[0]?.sequence_number ? Number(latest[0].sequence_number) : 0 };
}

function closeWithError(socket: WebSocket, code: number, message: string): void {
  try { socket.close(code, message); } catch { /* socket may already be gone */ }
}

export function installRealtimeServer(server: HttpServer, services: ApiServices): () => Promise<void> {
  const wss = new WebSocketServer({ noServer: true, clientTracking: false, perMessageDeflate: false, handleProtocols: (protocols) => protocols.has('amaal.v1') ? 'amaal.v1' : '' });
  const clients = new Set<Client>();
  let subscriber: Redis | null = null;

  const ensureSubscriber = (): Redis | null => {
    if (subscriber || !valkeyUrl()) return subscriber;
    subscriber = new Redis(valkeyUrl()!, { maxRetriesPerRequest: null, enableReadyCheck: true });
    subscriber.on('error', (error) => console.error('[realtime] Valkey subscriber error', error));
    void subscriber.subscribe(CHANNEL);
    subscriber.on('message', (_channel, message) => {
      let event: DurableRealtimeEvent;
      try { event = JSON.parse(message) as DurableRealtimeEvent; } catch { return; }
      for (const client of clients) {
        if (client.socket.readyState !== WebSocket.OPEN) continue;
        if (!canReceiveRealtimeEvent(client.context, event)) continue;
        if (event.sequence <= client.lastSequence) continue;
        client.lastSequence = event.sequence;
        client.socket.send(JSON.stringify({ type: 'event', event }));
      }
    });
    return subscriber;
  };

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname !== '/v1/realtime' && pathname !== '/api/v1/realtime') return;
    if (!originAllowed(typeof request.headers.origin === 'string' ? request.headers.origin : undefined)) {
      socket.destroy();
      return;
    }

    const token = extractBearerFromProtocols(typeof request.headers['sec-websocket-protocol'] === 'string' ? request.headers['sec-websocket-protocol'] : undefined);
    if (!token) { socket.destroy(); return; }

    wss.handleUpgrade(request, socket, head, async (ws) => {
      try {
        const user = await authenticateBearerToken(`Bearer ${token}`);
        const context = await services.transactions.withTransaction({ requestId: randomUUID(), actorUserId: user.id }, (tx) => loadAuthorizationContext(tx, user.id));
        const url = new URL(request.url ?? '/', 'http://localhost');
        const after = Math.max(Number(url.searchParams.get('after') ?? 0) || 0, 0);
        const replay = await listRealtimeEvents(services, context, after, MAX_REPLAY);
        const client: Client = { socket: ws, userId: user.id, context, lastSequence: after };
        clients.add(client);

        if (!ensureSubscriber() && process.env.AMAAL_REALTIME_REQUIRE_VALKEY === 'true') {
          closeWithError(ws, 1013, 'Realtime transport is temporarily unavailable.');
          clients.delete(client);
          return;
        }

        ws.send(JSON.stringify({ type: 'hello', version: 1, userId: user.id, lastSequence: replay.latestSequence }));
        for (const event of replay.items) {
          if (event.sequence <= client.lastSequence) continue;
          client.lastSequence = event.sequence;
          ws.send(JSON.stringify({ type: 'event', event }));
        }

        ws.on('pong', () => { /* liveness handled by interval */ });
        ws.on('close', () => clients.delete(client));
        ws.on('error', () => clients.delete(client));
        ws.on('message', (raw: RawData) => {
          try {
            const message = JSON.parse(raw.toString()) as { type?: string; after?: number };
            if (message.type === 'replay') {
              const requestedAfter = Math.max(Number(message.after ?? client.lastSequence) || 0, 0);
              void listRealtimeEvents(services, context, requestedAfter, MAX_REPLAY).then((result) => {
                for (const event of result.items) {
                  if (event.sequence <= client.lastSequence || ws.readyState !== WebSocket.OPEN) continue;
                  client.lastSequence = event.sequence;
                  ws.send(JSON.stringify({ type: 'event', event }));
                }
              }).catch((error) => console.error('[realtime] replay failed', error));
            }
          } catch { /* ignore malformed client messages */ }
        });
      } catch (error) {
        console.error('[realtime] handshake failed', error);
        closeWithError(ws, 1008, 'Realtime authentication failed.');
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (client.socket.readyState !== WebSocket.OPEN) continue;
      try { client.socket.ping(); } catch { clients.delete(client); }
    }
  }, 30_000);

  return async () => {
    clearInterval(heartbeat);
    for (const client of clients) closeWithError(client.socket, 1001, 'Server shutting down.');
    clients.clear();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    if (subscriber) {
      const current = subscriber;
      subscriber = null;
      await current.quit().catch(() => current.disconnect());
    }
  };
}
