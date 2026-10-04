import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceDefinition } from '../../services/api/src/workspace.ts';

test('Stage 6 workspace definitions stay aligned to the specification', () => {
  assert.deepEqual(workspaceDefinition('AGENT').modules, ['Sell', 'Customers', 'My Stock', 'Aged Stock', 'Recovery', 'Sales', 'Commission', 'Allocation History']);
  assert.deepEqual(workspaceDefinition('TEAM_LEADER').modules, ['Team Sales', 'Agents', 'Customers', 'Team Stock', 'Aged Stock', 'Recovery', 'Commission', 'Agent Comparison']);
  assert.ok(workspaceDefinition('ADMIN').modules.includes('Security'));
});
