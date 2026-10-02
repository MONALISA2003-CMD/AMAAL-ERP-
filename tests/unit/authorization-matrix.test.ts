import assert from 'node:assert/strict';
import test from 'node:test';
import { authorize, type AuthorizationContext } from '../../packages/permissions/src/authorization.ts';

const tl: AuthorizationContext = { userId:'tl-a', roles:['TEAM_LEADER'], permissions:['users.view'], regionIds:['r1'], subregionIds:['s1'], teamIds:['t1'], shopIds:['sh1'] };
const manager: AuthorizationContext = { userId:'m-a', roles:['MANAGER'], permissions:['users.view'], regionIds:['r1'], subregionIds:['s1'], teamIds:['t1','t2'], shopIds:['sh1','sh2'] };
const rm: AuthorizationContext = { userId:'rm-a', roles:['REGIONAL_MANAGER'], permissions:['users.view'], regionIds:['r1'], subregionIds:['s1','s2'], teamIds:['t1','t2','t3'], shopIds:['sh1','sh2','sh3'] };
const admin: AuthorizationContext = { userId:'admin-a', roles:['ADMIN'], permissions:['users.view'], regionIds:[], teamIds:[], shopIds:[] };

test('CEO bypasses resource scope',()=>{
  const ctx={...admin,roles:['CEO'] as const,userId:'ceo'};
  assert.equal(authorize(ctx,'inventory.view',{teamId:'other-team'}).allowed,true);
});

test('Admin is company-scoped but still permission-bound',()=>{
  assert.equal(authorize(admin,'users.view',{regionId:'r99'}).allowed,true);
  assert.equal(authorize(admin,'inventory.adjust',{regionId:'r99'}).allowed,false);
});

test('Team leader cannot reach another team in the same region',()=>{
  assert.equal(authorize(tl,'users.view',{teamId:'t2',regionId:'r1'}).allowed,false);
});

test('Manager can reach managed teams but not another manager team',()=>{
  assert.equal(authorize(manager,'users.view',{teamId:'t2',regionId:'r1'}).allowed,true);
  assert.equal(authorize(manager,'users.view',{teamId:'t99',regionId:'r1'}).allowed,false);
});

test('Regional manager is region-wide and can reach teams and shops in region',()=>{
  assert.equal(authorize(rm,'users.view',{teamId:'t3',regionId:'r1'}).allowed,true);
  assert.equal(authorize(rm,'users.view',{shopId:'sh3',teamId:'t3',regionId:'r1'}).allowed,true);
  assert.equal(authorize(rm,'users.view',{regionId:'r99'}).allowed,false);
});

test('narrower resource cannot fall back to broader region scope',()=>{
  assert.equal(authorize(tl,'users.view',{teamId:'t99',regionId:'r1'}).allowed,false);
  assert.equal(authorize(tl,'users.view',{shopId:'sh99',teamId:'t1',regionId:'r1'}).allowed,false);
});

test('ownership is valid only for the owning user when no broader scope is present',()=>{
  assert.equal(authorize(tl,'users.view',{ownerUserId:'tl-a'}).allowed,true);
  assert.equal(authorize(tl,'users.view',{ownerUserId:'agent-b'}).allowed,false);
});
