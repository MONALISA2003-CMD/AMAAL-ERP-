import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiServer } from '../../services/api/src/http.ts';

process.env.AMAAL_NEON_AUTH_URL = process.env.AMAAL_NEON_AUTH_URL ?? 'https://auth.example.test/neondb/auth';
process.env.AMAAL_NEON_AUTH_JWKS_URL = process.env.AMAAL_NEON_AUTH_JWKS_URL ?? 'https://auth.example.test/neondb/auth/.well-known/jwks.json';
process.env.AMAAL_NEON_AUTH_ISSUER = process.env.AMAAL_NEON_AUTH_ISSUER ?? 'https://auth.example.test';
process.env.AMAAL_NEON_AUTH_AUDIENCE = process.env.AMAAL_NEON_AUTH_AUDIENCE ?? 'https://auth.example.test';
process.env.AMAAL_DATABASE_URL = process.env.AMAAL_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:1/amaal';

async function startServer() {
  const server = createApiServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return server;
}

async function request(server: ReturnType<typeof createApiServer>, path: string, method = 'GET') {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return fetch(`http://127.0.0.1:${address.port}${path}`, { method });
}

test('health endpoint is public', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const response = await request(server, '/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'amaal-api' });
});

test('api health alias is public', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const response = await request(server, '/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'amaal-api' });
});

test('readiness endpoint is public and reports database state', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const response = await request(server, '/ready');
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.ready, false);
  assert.equal(payload.service, 'amaal-api');
  assert.equal(payload.checks.database, 'failed');
});

test('readiness compatibility alias is public', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const response = await request(server, '/api/ready');
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.ready, false);
  assert.equal(payload.checks.database, 'failed');
});

test('unknown public path returns 404 without demanding auth', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const response = await request(server, '/');
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'NOT_FOUND');
});

test('recognized API path still requires authentication', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const response = await request(server, '/api/v1/me');
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'AUTHENTICATION_REQUIRED');
});
