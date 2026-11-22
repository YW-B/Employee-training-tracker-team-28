// EN: Shared helpers for the API tests: test tokens signed with our own RSA key (the REAL auth module
//     checks them), a fake fetch that plays S1 and S2 per docs/API_CONTRACT.md, an in-memory fake of
//     S3's database store, and call() that starts the app on a free port and makes one request.
// Franco: Helpers moshtaraka lel API tests: tokens mamdeya b RSA key bta3na (el auth module el 7a2i2i
//     bey-check-ha), fetch mozayyaf beyel3ab dor S1 w S2, store mozayyaf fel memory badal el database,
//     w call() elly beyshaghal el app 3ala port fady w ye3mel request wa7ed.
'use strict';
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
const load = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', name), 'utf8'));

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
// EN: in-memory stand-in for src/store.js: same functions, same "one row per employee per day" rule.
// Franco: badeel fel memory le src/store.js: nafs el functions w nafs rule "satr wa7ed lel mowazzaf fel yom".
function fakeStore() {
  const rows = new Map(); // key "employeeId|date"
  return {
    rows,
    async upsertSnapshots(date, list) {
      for (const r of list) rows.set(`${r.employeeId}|${date}`, { ...r, date });
      return list.length;
    },
    async trend(teamId, from, to) {
      const byDate = new Map();
      for (const r of rows.values()) {
        if (r.teamId !== teamId || r.date < from || r.date > to) continue;
        const d = byDate.get(r.date) || { date: r.date, employee_count: 0, compliant_count: 0 };
        d.employee_count += 1;
        if (r.status === 'Compliant') d.compliant_count += 1;
        byDate.set(r.date, d);
      }
      return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    },
  };
}

async function call(pathName, { bearer, overrides, method = 'GET', store = fakeStore() } = {}) {
  const fake = fakeFetch(overrides);
  const upstream = createUpstream({ s1Url: 'http://s1', s2Url: 'http://s2', fetchImpl: fake.fetchImpl, timeoutMs: 500 });
  const app = createApp({ auth, upstream, store, logger: quietLogger, today: () => '2026-11-21' });
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const headers = bearer ? { Authorization: `Bearer ${bearer}` } : {};
    const res = await fetch(`http://127.0.0.1:${port}${pathName}`, { method, headers });
    return { status: res.status, body: await res.json(), calls: fake.calls };
  } finally {
    server.close();
  }
}

module.exports = { TEAM, OTHER_TEAM, UNKNOWN_TEAM, SERVICE_CLIENT, token, fakeFetch, fakeStore, call };
