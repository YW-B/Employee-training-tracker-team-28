// EN: API tests for the dashboard endpoints. They use the REAL auth module with a test RSA key (so 401/403
//     are really checked) and a fake fetch that plays S1 and S2 (so no other service has to run).
//     "Today" is fixed to 2026-11-21 so the hand-calculated numbers from compliance.test.js apply.
// Franco: Tests lel dashboard endpoints. Betesta3mel el auth module el 7a2i2i b RSA key lel test (f 401/403
//     bet-et-check be-gad) w fetch mozayyaf beyel3ab dor S1 w S2 (f mafeesh service tanya lazem teshtaghal).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createAuth } = require('../../common/auth');
const { createApp } = require('../src/app');
const { createUpstream } = require('../src/upstream');

const TEAM = '10000000-0000-4000-8000-000000000001';
const OTHER_TEAM = '10000000-0000-4000-8000-000000000002';
const UNKNOWN_TEAM = '10000000-0000-4000-8000-000000000099';
const ISSUER = 'https://cognito.test/pool';
const WEB_CLIENT = 'web-client';
const SERVICE_CLIENT = 'service-client';
const load = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));

// ---------- test tokens signed with our own RSA key ----------
// EN: the auth module gets our public key instead of downloading Cognito's JWKS.
// Franco: el auth module beyakhod el public key bta3na badal ma yenazzel JWKS bta3 Cognito.
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key' };
const auth = createAuth({
  issuer: ISSUER, webClientIds: [WEB_CLIENT], serviceClientId: SERVICE_CLIENT, getKey: async (kid) => (kid === 'test-key' ? jwk : undefined),
});

function token({ groups = ['Manager'], clientId = WEB_CLIENT, expInSec = 900, key = privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'RS256', kid: 'test-key' });
  const body = b64({
    iss: ISSUER, token_use: 'access', client_id: clientId, sub: 'manager-sub', iat: now, exp: now + expInSec, 'cognito:groups': groups,
  });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url');
  return `${head}.${body}.${sig}`;
}

// ---------- fake S1 + S2 ----------
// EN: answers like the real services would, per docs/API_CONTRACT.md. `overrides` lets one test break a call.
// Franco: beyrod zay el services el 7a2i2eya. `overrides` beyekhalli test wa7ed yekassar call.
function fakeFetch(overrides = {}) {
  const calls = [];
  const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
  async function fetchImpl(url, options) {
    calls.push({ url, headers: options.headers });
    const p = new URL(url).pathname;
    for (const [prefix, fn] of Object.entries(overrides)) if (p.startsWith(prefix)) return fn();
    if (p === '/api/teams') return json(200, [{ id: TEAM, name: 'Operations', managerId: 'm1', managerName: 'Mona', employeeCount: 6 }]);
    if (p === `/api/teams/${TEAM}/employees`) return json(200, load('s1_employees.json'));
    if (p === `/api/teams/${TEAM}/assignments`) return json(200, load('s1_assignments.json'));
    if (p === `/api/compliance/teams/${TEAM}`) return json(200, load('s2_compliance.json'));
    if (p === `/api/teams/${OTHER_TEAM}/employees`) return json(403, { error: { code: 'FORBIDDEN' } });
    return json(404, { error: { code: 'NOT_FOUND' } });
  }
  return { fetchImpl, calls };
}

const quietLogger = { debug() {}, info() {}, warn() {}, error() {} };

// EN: start the app on a free port, run one request, stop it.
// Franco: neshaghal el app 3ala port fady, ne3mel request wa7ed, w ne2fel.
async function call(pathName, { bearer, overrides } = {}) {
  const fake = fakeFetch(overrides);
  const upstream = createUpstream({ s1Url: 'http://s1', s2Url: 'http://s2', fetchImpl: fake.fetchImpl, timeoutMs: 500 });
  const app = createApp({ auth, upstream, logger: quietLogger, today: () => '2026-11-21' });
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const headers = bearer ? { Authorization: `Bearer ${bearer}` } : {};
    const res = await fetch(`http://127.0.0.1:${port}${pathName}`, { headers });
    return { status: res.status, body: await res.json(), calls: fake.calls };
  } finally {
    server.close();
  }
}

const base = `/api/dashboard/teams/${TEAM}`;

// ---------- success cases (numbers hand-calculated in compliance.test.js) ----------
test('summary: 200 with hand-calculated numbers', async () => {
  const { status, body } = await call(`${base}/summary`, { bearer: token() });
  assert.strictEqual(status, 200);
  const { generatedAt, ...rest } = body;
  assert.ok(generatedAt);
  // EN: 6 employees, 4 compliant -> 66.7. e4: overdue + missing, e5: expired. One overdue assignment (e4, a5).
  //     Two Verified certificates expire within 30 days (e3, e6); e1's is only Pending so it does not count.
  // Franco: 6 mowazzafeen, 4 compliant -> 66.7. Assignment wa7ed overdue. Etnein certificates hayekhlaso.
  assert.deepStrictEqual(rest, {
    teamId: TEAM,
    teamName: 'Operations',
    employeeCount: 6,
    compliantCount: 4,
    nonCompliantCount: 2,
    complianceRate: 66.7,
    nonCompliantByReason: { OverdueTraining: 1, CertificateMissing: 1, CertificateExpired: 1 },
    overdueTrainings: 1,
    expiringWithin30Days: 2,
  });
});

test('employees: all, compliant, non-compliant', async () => {
  const all = await call(`${base}/employees`, { bearer: token() });
  assert.strictEqual(all.status, 200);
  assert.strictEqual(all.body.length, 6);
  const nc = await call(`${base}/employees?status=non-compliant`, { bearer: token() });
  assert.deepStrictEqual(nc.body.map((r) => [r.employeeId, r.reasons]),
    [['e4', ['OverdueTraining', 'CertificateMissing']], ['e5', ['CertificateExpired']]]);
  const c = await call(`${base}/employees?status=compliant`, { bearer: token() });
  assert.deepStrictEqual(c.body.map((r) => r.employeeId), ['e1', 'e2', 'e3', 'e6']);
});

test('attention: ranked list', async () => {
  const { status, body } = await call(`${base}/attention`, { bearer: token() });
  assert.strictEqual(status, 200);
  assert.deepStrictEqual(body.map((r) => r.employeeId), ['e5', 'e4', 'e6', 'e3']);
});

// EN: the manager's own token and the request id are forwarded to S1 and S2.
// Franco: el token bta3 el manager w el request id beyetba3to le S1 w S2.
test('forwards the caller token and X-Request-Id to S1 and S2', async () => {
  const t = token();
  const { calls } = await call(`${base}/summary`, { bearer: t });
  assert.ok(calls.length >= 4);
  for (const c of calls) {
    assert.strictEqual(c.headers.Authorization, `Bearer ${t}`);
    assert.ok(c.headers['X-Request-Id']);
  }
});

// ---------- 400 ----------
test('400: invalid status, checked before calling other services', async () => {
  const { status, body, calls } = await call(`${base}/employees?status=late`, { bearer: token() });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
  assert.strictEqual(calls.length, 0);
});

test('400: teamId is not a UUID', async () => {
  const { status } = await call('/api/dashboard/teams/abc/summary', { bearer: token() });
  assert.strictEqual(status, 400);
});

// ---------- 401 ----------
const authCases = [
  ['no token', undefined],
  ['expired token', token({ expInSec: -60 })],
  ['token signed with another key', token({ key: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey })],
  ['token for another app', token({ clientId: 'someone-else' })],
];
for (const [name, bearer] of authCases) {
  test(`401: ${name}`, async () => {
    const { status, body, calls } = await call(`${base}/summary`, { bearer });
    assert.strictEqual(status, 401);
    assert.strictEqual(body.error.code, 'UNAUTHENTICATED');
    assert.strictEqual(calls.length, 0);
  });
}

// ---------- 403 ----------
test('403: an Employee', async () => {
  const { status } = await call(`${base}/summary`, { bearer: token({ groups: ['Employee'] }) });
  assert.strictEqual(status, 403);
});

test('403: a Service token is not allowed on person routes', async () => {
  const { status } = await call(`${base}/summary`, { bearer: token({ groups: [], clientId: SERVICE_CLIENT }) });
  assert.strictEqual(status, 403);
});

test('403: manager of another team', async () => {
  const { status, body } = await call(`/api/dashboard/teams/${OTHER_TEAM}/summary`, { bearer: token() });
  assert.strictEqual(status, 403);
  assert.strictEqual(body.error.code, 'FORBIDDEN');
});

// ---------- 404 ----------
test('404: unknown team', async () => {
  const { status } = await call(`/api/dashboard/teams/${UNKNOWN_TEAM}/summary`, { bearer: token() });
  assert.strictEqual(status, 404);
});

// ---------- 502 / 503: never partial numbers ----------
test('502: S2 fails -> error body, no numbers', async () => {
  const { status, body } = await call(`${base}/summary`, {
    bearer: token(),
    overrides: { '/api/compliance': () => ({ ok: false, status: 500, json: async () => ({}) }) },
  });
  assert.strictEqual(status, 502);
  assert.strictEqual(body.error.code, 'UPSTREAM_ERROR');
  assert.strictEqual(body.complianceRate, undefined);
});

test('503: S1 does not answer', async () => {
  const { status, body } = await call(`${base}/attention`, {
    bearer: token(),
    overrides: { '/api/teams': () => { throw new Error('connect ECONNREFUSED'); } },
  });
  assert.strictEqual(status, 503);
  assert.strictEqual(body.error.code, 'UPSTREAM_UNAVAILABLE');
});
