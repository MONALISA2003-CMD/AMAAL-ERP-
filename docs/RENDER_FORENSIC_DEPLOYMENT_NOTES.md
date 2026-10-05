# Render deployment forensic notes

## Why the runtime is Node 24 native TypeScript

The Render API and outbox worker intentionally do not depend on `tsx`. Node 24 can execute the server TypeScript directly, and the server sources use `--experimental-transform-types` for the required syntax.

## Render commands

API and worker build:

```text
npm install --no-audit --no-fund --package-lock=false
```

API start:

```text
AMAAL_API_AUTOSTART=true node --experimental-transform-types services/api/src/http.ts
```

Worker start:

```text
node --experimental-transform-types -e "const {spawn}=require('node:child_process');const http=require('node:http');const p=spawn(process.execPath,['--experimental-transform-types','services/outbox-worker/src/runner.ts'],{stdio:'inherit',env:process.env});http.createServer((req,res)=>{if(req.url==='/health'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,service:'amaal-worker'}));return;}res.writeHead(404);res.end();}).listen(Number(process.env.PORT||10000),'0.0.0.0');p.on('exit',(code)=>{if(code!==null&&code!==0)process.exit(code)});const stop=()=>p.kill('SIGTERM');process.on('SIGTERM',()=>{stop();setTimeout(()=>process.exit(0),5000)});process.on('SIGINT',()=>{stop();setTimeout(()=>process.exit(0),5000)});"
```

## Repository gate

The GitHub ZIP-sync workflow validates required files and workspace dependency declarations, installs dependencies with npm, typechecks and runs the deterministic unit/release tests before committing the synchronized repository.

## Known production-schema gate

The aging/recovery worker checks that the Stage 5 tables and `aging_policies` configuration columns exist before running Stage 5 SQL. When the approved migration has not yet been applied, the evaluation cycle exits safely with a readiness warning instead of raising a database error on every tick. This is a safety gate, not a substitute for the production migration.
