import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const required = [
  'services/intelligence/README.md',
  'services/intelligence/pyproject.toml',
  'services/intelligence/requirements.txt',
  'services/intelligence/amaal_intelligence/contracts.py',
  'services/intelligence/amaal_intelligence/quality.py',
  'services/intelligence/amaal_intelligence/models.py',
  'services/intelligence/amaal_intelligence/pipeline.py',
  'services/intelligence/amaal_intelligence/registry.py',
  'services/intelligence/amaal_intelligence/evaluation.py',
  'services/intelligence/amaal_intelligence/postgres.py',
  'services/intelligence/amaal_intelligence/server.py',
  'services/intelligence/snapshot.py',
  'services/intelligence/train.py',
  'database/migrations/20261004_000034_phase9_ml_intelligence.sql',
  'services/api/src/intelligence.ts',
  'apps/web/app/intelligence/page.tsx',
];
for (const file of required) assert.equal(existsSync(join(root,file)), true, `missing ${file}`);
const migration = readFileSync(join(root,'database/migrations/20261004_000034_phase9_ml_intelligence.sql'),'utf8');
for (const token of ['ml_model_registry','ml_training_runs','ml_feature_snapshots','ml_predictions','ml_prediction_evaluations','ai.intelligence.view','SHADOW']) assert.match(migration, new RegExp(token.replace('.', '\\.')));
assert.doesNotMatch(migration, /delete\s+from\s+public\.products/i);
assert.doesNotMatch(migration, /drop\s+table\s+public\.(products|imei_units|sales)/i);
assert.match(readFileSync(join(root,'services/intelligence/amaal_intelligence/models.py'),'utf8'), /TimeSeriesSplit/);
assert.match(readFileSync(join(root,'services/intelligence/amaal_intelligence/models.py'),'utf8'), /StandardScaler/);
assert.match(readFileSync(join(root,'services/intelligence/amaal_intelligence/evaluation.py'),'utf8'), /expected_calibration_error/);
assert.match(readFileSync(join(root,'services/intelligence/amaal_intelligence/registry.py'),'utf8'), /sha256/);
execFileSync('python3',['-m','py_compile',...required.filter((f)=>f.endsWith('.py'))],{stdio:'inherit'});
console.log('Stage 9 validator: PASS — Python syntax, model governance scaffolding, migration guardrails, and required files.');
for (const file of [
  'database/migrations/20261004_000035_phase9_production_mlops.sql',
  'services/intelligence/amaal_intelligence/artifacts.py',
  'services/intelligence/amaal_intelligence/monitoring.py',
  'services/intelligence/amaal_intelligence/lifecycle.py',
  'services/intelligence/amaal_intelligence/labels.py',
  'services/intelligence/amaal_intelligence/uncertainty.py',
  'services/intelligence/requirements.lock',
]) assert.equal(existsSync(join(root,file)), true, `missing Stage 9.5 file ${file}`);
const mlops = readFileSync(join(root,'database/migrations/20261004_000035_phase9_production_mlops.sql'),'utf8');
for (const token of ['ml_model_artifacts','ml_feature_validation_runs','ml_prediction_monitoring','ml_monitoring_alerts','ml_canary_rollouts','ml_prediction_outcomes','ml_governance_decisions']) assert.match(mlops,new RegExp(token));
