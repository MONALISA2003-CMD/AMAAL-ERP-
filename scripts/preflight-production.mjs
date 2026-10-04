const required = [
  'AMAAL_DATABASE_URL',
  'AMAAL_VALKEY_URL',
  'AMAAL_WEB_ORIGIN',
  'NEON_AUTH_COOKIE_SECRET',
  'AMAAL_INTELLIGENCE_DATABASE_URL',
  'AMAAL_INTELLIGENCE_INTERNAL_TOKEN',
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Production preflight blocked: ${missing.join(', ')} are not configured.`);
  process.exit(2);
}
if (process.version.split('.')[0] !== 'v24') {
  console.error(`Production preflight blocked: Node 24 is required; found ${process.version}.`);
  process.exit(2);
}
console.log('Production preflight configuration shape: PASS');
