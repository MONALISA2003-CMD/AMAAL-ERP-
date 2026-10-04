import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root=process.cwd();
const required=[
  'package.json','pnpm-workspace.yaml','.gitignore',
  'database/migrations/20261004_000035_phase9_production_mlops.sql',
  'services/intelligence/requirements.lock','services/intelligence/pyproject.toml',
  'services/intelligence/amaal_intelligence/artifacts.py',
  'services/intelligence/amaal_intelligence/monitoring.py',
  'services/intelligence/amaal_intelligence/lifecycle.py',
  'services/intelligence/amaal_intelligence/labels.py',
  'services/intelligence/amaal_intelligence/uncertainty.py',
  'render.yaml','.github/workflows/ci.yml',
];
for (const f of required) if(!existsSync(join(root,f))) throw new Error(`Missing release-hardening file: ${f}`);
const migration=readFileSync(join(root,required[3]),'utf8');
for(const token of ['ml_model_artifacts','ml_prediction_monitoring','ml_monitoring_alerts','ml_canary_rollouts','ml_prediction_outcomes','ml_governance_decisions']) if(!migration.includes(token)) throw new Error(`Missing migration object: ${token}`);
for(const token of ['products','imei_units','sales']) if(/delete\s+from\s+public\.${token}|drop\s+table\s+public\.${token}/i.test(migration)) throw new Error(`Destructive guard triggered for ${token}`);
const py=spawnSync('python3',['-m','py_compile','services/intelligence/amaal_intelligence/artifacts.py','services/intelligence/amaal_intelligence/monitoring.py','services/intelligence/amaal_intelligence/lifecycle.py','services/intelligence/amaal_intelligence/labels.py','services/intelligence/amaal_intelligence/uncertainty.py'],{stdio:'inherit'});
if((py.status??1)!==0) process.exit(py.status??1);
console.log('Release hardening validator: PASS');
