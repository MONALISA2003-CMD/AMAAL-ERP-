#!/usr/bin/env node

const webBase = (process.env.AMAAL_WEB_URL ?? 'https://amaal-erp.vercel.app').replace(/\/$/, '');
const apiBase = (process.env.AMAAL_API_URL ?? 'https://amaal-api.onrender.com').replace(/\/$/, '');
const expectedIssuer = process.env.AMAAL_EXPECTED_AUTH_ISSUER?.replace(/\/$/, '');
const email = process.env.AMAAL_E2E_EMAIL;
const password = process.env.AMAAL_E2E_PASSWORD;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function decodePart(part) {
  return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64url').toString('utf8'));
}

function cookieHeader(setCookies) {
  return setCookies.map((value) => value.split(';', 1)[0]).join('; ');
}

async function getJson(url, init = {}) {
  const response = await fetch(url, { ...init, redirect: 'manual' });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* non-JSON response */ }
  return { response, data, text };
}

console.log(`Phase 2A auth check: ${webBase} → ${apiBase}`);

const sessionBefore = await getJson(`${webBase}/api/auth/get-session`);
assert(sessionBefore.response.status === 200, `get-session expected 200, got ${sessionBefore.response.status}`);
console.log(`✓ unauthenticated get-session: ${sessionBefore.response.status}`);

const config = await getJson(`${apiBase}/v1/auth/config`);
assert(config.response.status === 200, `auth config expected 200, got ${config.response.status}`);
assert(typeof config.data?.neonAuthUrl === 'string', 'auth config did not return neonAuthUrl');
console.log('✓ API auth config is available');

const unauth = await getJson(`${apiBase}/v1/me`);
assert(unauth.response.status === 401, `unauthenticated /v1/me expected 401, got ${unauth.response.status}`);
assert(unauth.data?.error === 'AUTHENTICATION_REQUIRED', 'unauthenticated /v1/me returned the wrong error');
console.log('✓ API rejects unauthenticated /v1/me');

if (!email || !password) {
  console.log('! Full credentialed path skipped. Set AMAAL_E2E_EMAIL and AMAAL_E2E_PASSWORD to run sign-in → JWT → /v1/me.');
  process.exit(0);
}

const signIn = await getJson(`${webBase}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, rememberMe: true }),
});
assert(signIn.response.status >= 200 && signIn.response.status < 300, `sign-in failed with ${signIn.response.status}: ${signIn.text}`);
const cookies = typeof signIn.response.headers.getSetCookie === 'function' ? signIn.response.headers.getSetCookie() : [];
assert(cookies.length > 0, 'sign-in did not return a session cookie');
const cookie = cookieHeader(cookies);
console.log('✓ Neon Auth sign-in returned a session cookie');

const session = await getJson(`${webBase}/api/auth/get-session`, { headers: { cookie } });
assert(session.response.status === 200, `authenticated get-session expected 200, got ${session.response.status}`);
const sessionUserId = session.data?.data?.user?.id;
assert(typeof sessionUserId === 'string', 'authenticated session did not contain a user id');
console.log(`✓ authenticated session established for subject ${sessionUserId}`);

const tokenResponse = await getJson(`${webBase}/api/auth/token`, { headers: { cookie } });
assert(tokenResponse.response.status === 200, `token endpoint expected 200, got ${tokenResponse.response.status}`);
const token = tokenResponse.data?.token;
assert(typeof token === 'string' && token.split('.').length === 3, 'token endpoint did not return a JWT');
const [headerPart, payloadPart] = token.split('.');
const header = decodePart(headerPart);
const payload = decodePart(payloadPart);
assert(typeof payload.sub === 'string', 'JWT is missing sub');
assert(typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000), 'JWT is expired or missing exp');
assert(typeof payload.iss === 'string', 'JWT is missing iss');
assert(typeof payload.aud === 'string', 'JWT is missing aud');
if (expectedIssuer) {
  assert(payload.iss === expectedIssuer, `JWT issuer mismatch: ${payload.iss}`);
  assert(payload.aud === expectedIssuer, `JWT audience mismatch: ${payload.aud}`);
}
console.log(`✓ JWT issued: alg=${header.alg}, kid=${header.kid}, iss=${payload.iss}`);

const me = await getJson(`${apiBase}/v1/me`, {
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
});
assert(me.response.status === 200, `authenticated /v1/me expected 200, got ${me.response.status}: ${me.text}`);
assert(me.data?.user?.id === payload.sub, 'JWT subject does not match /v1/me user id');
assert(me.data?.authorization?.userId === payload.sub, 'authorization scope does not match JWT subject');
assert(me.data?.mfaRequired === false, 'Phase 2A development gate expected MFA to remain disabled');
console.log('✓ JWT → Render /v1/me end-to-end identity match');
console.log('PHASE 2A AUTH E2E: PASS');
