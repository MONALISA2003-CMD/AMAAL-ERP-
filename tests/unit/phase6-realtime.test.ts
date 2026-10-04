import assert from 'node:assert/strict';
import test from 'node:test';
import { canReceiveRealtimeEvent } from '../../services/api/src/realtime.ts';

test('realtime scope is denied outside the user organizational boundary', () => {
  const context = {
    userId: 'user-a', roles: ['TEAM_LEADER'], permissions: ['sales.view'],
    regionIds: ['region-a'], teamIds: ['team-a'], shopIds: [], subregionIds: [],
  } as const;
  assert.equal(canReceiveRealtimeEvent(context, { eventType: 'SALE_COMPLETED', aggregateType: 'SALE', regionId: 'region-b', teamId: 'team-b', actorUserId: 'user-b', recipientUserId: null }), false);
  assert.equal(canReceiveRealtimeEvent(context, { eventType: 'SALE_COMPLETED', aggregateType: 'SALE', regionId: 'region-b', teamId: 'team-b', actorUserId: null, recipientUserId: 'user-a' }), true);
  assert.equal(canReceiveRealtimeEvent(context, { eventType: 'SALE_COMPLETED', aggregateType: 'SALE', regionId: 'region-b', teamId: 'team-a', actorUserId: null, recipientUserId: null }), true);
});

test('admin realtime delivery obeys domain permissions', () => {
  const context = {
    userId: 'admin-a', roles: ['ADMIN'], permissions: ['inventory.view'],
    regionIds: [], teamIds: [], shopIds: [], subregionIds: [],
  } as const;
  assert.equal(canReceiveRealtimeEvent(context, { eventType: 'SALE_COMPLETED', aggregateType: 'SALE', regionId: 'region-a', teamId: null, actorUserId: null, recipientUserId: null }), false);
  assert.equal(canReceiveRealtimeEvent(context, { eventType: 'STOCK_RECEIVED', aggregateType: 'IMEI_UNIT', regionId: 'region-a', teamId: null, actorUserId: null, recipientUserId: null }), true);
});
