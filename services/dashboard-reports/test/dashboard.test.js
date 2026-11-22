// EN: API tests for the dashboard endpoints. They use the REAL auth module with a test RSA key (so 401/403
//     are really checked) and a fake fetch that plays S1 and S2 (so no other service has to run).
//     "Today" is fixed to 2026-11-21 so the hand-calculated numbers from compliance.test.js apply.
// Franco: Tests lel dashboard endpoints. Betesta3mel el auth module el 7a2i2i b RSA key lel test (f 401/403
//     bet-et-check be-gad) w fetch mozayyaf beyel3ab dor S1 w S2 (f mafeesh service tanya lazem teshtaghal).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const {
  TEAM, OTHER_TEAM, UNKNOWN_TEAM, SERVICE_CLIENT, token, call,
} = require('../test-support/helpers');

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
