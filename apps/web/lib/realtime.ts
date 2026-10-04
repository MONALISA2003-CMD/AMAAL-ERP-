'use client';

import { authClient } from './auth';

export type ClientRealtimeEvent = {
  id: string;
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

type Listener = (event: ClientRealtimeEvent) => void;

function websocketUrl(after: number): string {
  const explicit = process.env.NEXT_PUBLIC_AMAAL_WS_URL?.trim();
  const base = explicit || 'wss://amaal-api.onrender.com';
  return `${base.replace(/\/$/, '')}/v1/realtime?after=${encodeURIComponent(after)}`;
}

export function startAmaalRealtime(after: number, listener: Listener): () => void {
  let closed = false;
  let socket: WebSocket | null = null;
  let retry = 0;
  let lastSequence = after;

  const connect = async () => {
    if (closed) return;
    const tokenResult = await authClient.token();
    const token = tokenResult?.data?.token;
    if (!token || closed) return;

    try {
      socket = new WebSocket(websocketUrl(lastSequence), ['amaal.v1', token]);
      socket.onopen = () => { retry = 0; };
      socket.onmessage = async (message) => {
        try {
          const packet = JSON.parse(message.data) as { type?: string; event?: ClientRealtimeEvent };
          if (packet.type !== 'event' || !packet.event) return;
          if (packet.event.sequence > lastSequence + 1) {
            await replayMissing(lastSequence, listener);
          }
          lastSequence = Math.max(lastSequence, packet.event.sequence);
          listener(packet.event);
        } catch { /* ignore malformed transport packets */ }
      };
      socket.onclose = () => scheduleReconnect();
      socket.onerror = () => { socket?.close(); };
    } catch { scheduleReconnect(); }
  };

  const replayMissing = async (from: number, onEvent: Listener) => {
    try {
      const session = await authClient.token();
      const token = session?.data?.token;
      if (!token) return;
      const response = await fetch(`/api/amaal/v1/realtime/events?after=${encodeURIComponent(from)}&limit=250`, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) return;
      const data = await response.json() as { items?: ClientRealtimeEvent[] };
      for (const event of data.items ?? []) {
        if (event.sequence <= lastSequence) continue;
        lastSequence = event.sequence;
        onEvent(event);
      }
    } catch { /* reconnect path will retry */ }
  };

  const scheduleReconnect = () => {
    if (closed) return;
    const delay = Math.min(1000 * (2 ** retry), 30000);
    retry += 1;
    window.setTimeout(connect, delay);
  };

  void connect();
  const polling = window.setInterval(() => { void replayMissing(lastSequence, listener); }, 15000);

  return () => {
    closed = true;
    window.clearInterval(polling);
    socket?.close(1000, 'client shutdown');
    socket = null;
  };
}
