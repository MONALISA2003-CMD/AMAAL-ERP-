import assert from 'node:assert/strict';
import test from 'node:test';
import { selectWorkspaceRole, workspaceDefinition } from '../../services/api/src/workspace.ts';

test('workspace role selection prefers the strongest authorized role', () => {
  assert.equal(selectWorkspaceRole(['AGENT', 'TEAM_LEADER']), 'TEAM_LEADER');
  assert.equal(selectWorkspaceRole(['MANAGER', 'AGENT']), 'MANAGER');
  assert.equal(selectWorkspaceRole(['ADMIN', 'CEO']), 'CEO');
});

test('role workspaces expose the Stage 6 source-defined modules', () => {
  assert.deepEqual(workspaceDefinition('AGENT').modules.slice(0, 4), ['Sell', 'Customers', 'My Stock', 'Aged Stock']);
  assert.ok(workspaceDefinition('TEAM_LEADER').modules.includes('Agent Comparison'));
  assert.ok(workspaceDefinition('MANAGER').modules.includes('Allocation'));
  assert.ok(workspaceDefinition('REGIONAL_MANAGER').modules.includes('Best Agents'));
  assert.ok(workspaceDefinition('CEO').modules.includes('System Health'));
});
