// EN: Tests for the daily snapshot job (POST /api/dashboard/run-snapshot) and the trend
//     (GET /api/dashboard/teams/{teamId}/trend), plus a check that the store's SQL passes the common
//     db guard rails (parameterised, no quotes, one statement). "Today" is fixed to 2026-11-21.
// Franco: Tests le job el snapshot el yomy w lel trend, w check en el SQL bta3 el store bey3ady 3ala
//     qawa3ed el aman fe common db (parameterised, mafeesh quotes, statement wa7ed). "Today" = 2026-11-21.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createDb } = require('../../common/db');
const { createStore } = require('../src/store');
const {
  TEAM, OTHER_TEAM, SERVICE_CLIENT, token, fakeStore, call,
} = require('../test-support/helpers');

const serviceToken = () => token({ groups: [], clientId: SERVICE_CLIENT });

// ---------- run-snapshot ----------
// EN: 6 employees in the fixture team -> 6 rows for today. Running it again the same day keeps 6 rows.
// Franco: 6 mowazzafeen fel team -> 6 rows lel naharda. Law eshtaghal tany nafs el yom yefdal 6.
test('run-snapshot: one row per employee, idempotent on the same day', async () => {
  const store = fakeStore();
  const first = await call('/api/dashboard/run-snapshot', { method: 'POST', bearer: serviceToken(), store });
  assert.strictEqual(first.status, 200);
  assert.deepStrictEqual(first.body, { snapshotDate: '2026-11-21', teamsProcessed: 1, rowsUpserted: 6 });
  const second = await call('/api/dashboard/run-snapshot', { method: 'POST', bearer: serviceToken(), store });
  assert.strictEqual(second.status, 200);
  assert.strictEqual(store.rows.size, 6);

  // EN: e4 has 1 overdue assignment and 2 reasons; e3 has 1 certificate expiring soon.
  // Franco: e4 3ando assignment overdue wa7ed w sababein; e3 3ando certificate hayekhlas.
  const e4 = store.rows.get('e4|2026-11-21');
  assert.deepStrictEqual([e4.status, e4.reasons, e4.overdueCount], ['Non-compliant', ['OverdueTraining', 'CertificateMissing'], 1]);
  assert.strictEqual(store.rows.get('e3|2026-11-21').expiringCount, 1);
});

test('run-snapshot: 403 for a Manager (job only)', async () => {
  const { status } = await call('/api/dashboard/run-snapshot', { method: 'POST', bearer: token() });
  assert.strictEqual(status, 403);
});

test('run-snapshot: 401 without a token', async () => {
  const { status } = await call('/api/dashboard/run-snapshot', { method: 'POST' });
  assert.strictEqual(status, 401);
});

// EN: if S2 fails, NOTHING is written (no half day in the history).
// Franco: law S2 fashal, mafeesh 7aga betetkteb (mafeesh nos yom fel tareekh).
test('run-snapshot: S2 fails -> 502 and nothing saved', async () => {
  const store = fakeStore();
  const { status } = await call('/api/dashboard/run-snapshot', {
    method: 'POST',
    bearer: serviceToken(),
    store,
    overrides: { '/api/compliance': () => ({ ok: false, status: 500, json: async () => ({}) }) },
  });
  assert.strictEqual(status, 502);
  assert.strictEqual(store.rows.size, 0);
});

// ---------- trend ----------
// EN: seed 4 days of history; ?days=3 means 2026-11-19 .. 2026-11-21, so 2026-11-18 is left out.
//     2026-11-20: 3 of 4 compliant -> 75.0. 2026-11-21: 1 of 3 -> 33.3.
// Franco: n7ott tareekh 4 ayam; ?days=3 ya3ni men 2026-11-19 le 2026-11-21, f 2026-11-18 barra.
function seededStore() {
  const store = fakeStore();
  const put = (date, emp, status, teamId = TEAM) => store.rows.set(`${emp}|${date}`, { date, teamId, employeeId: emp, status });
  put('2026-11-18', 'e1', 'Compliant');
  put('2026-11-19', 'e1', 'Compliant');
  put('2026-11-19', 'e2', 'Non-compliant');
  ['e1', 'e2', 'e3'].forEach((e) => put('2026-11-20', e, 'Compliant'));
  put('2026-11-20', 'e4', 'Non-compliant');
  put('2026-11-21', 'e1', 'Compliant');
  put('2026-11-21', 'e2', 'Non-compliant');
  put('2026-11-21', 'e3', 'Non-compliant');
  put('2026-11-21', 'x9', 'Compliant', OTHER_TEAM); // EN: another team: ignored / Franco: team tany: mesh bet7seb
  return store;
}

test('trend: points per day inside the window', async () => {
  const { status, body } = await call(`/api/dashboard/teams/${TEAM}/trend?days=3`, { bearer: token(), store: seededStore() });
  assert.strictEqual(status, 200);
  assert.deepStrictEqual(body, {
    teamId: TEAM,
    days: 3,
    points: [
      { date: '2026-11-19', complianceRate: 50, employeeCount: 2 },
      { date: '2026-11-20', complianceRate: 75, employeeCount: 4 },
      { date: '2026-11-21', complianceRate: 33.3, employeeCount: 3 },
    ],
  });
});

test('trend: default is 30 days', async () => {
  const { body } = await call(`/api/dashboard/teams/${TEAM}/trend`, { bearer: token(), store: seededStore() });
  assert.strictEqual(body.days, 30);
  assert.strictEqual(body.points.length, 4);
});

for (const bad of ['91', '0', 'abc', '2.5']) {
  test(`trend: 400 for days=${bad}`, async () => {
    const { status, calls } = await call(`/api/dashboard/teams/${TEAM}/trend?days=${bad}`, { bearer: token() });
    assert.strictEqual(status, 400);
    assert.strictEqual(calls.length, 0);
  });
}

test('trend: 403 for the manager of another team', async () => {
  const { status } = await call(`/api/dashboard/teams/${OTHER_TEAM}/trend`, { bearer: token() });
  assert.strictEqual(status, 403);
});

// ---------- store SQL ----------
// EN: run the real store through the real common db helper with a fake pg pool: every query must pass
//     the guard rails, values travel as $n parameters, and the snapshot rows are written in a transaction.
// Franco: neshaghal el store el 7a2i2i 3an taree2 db helper el 7a2i2i b pool mozayyaf: kol query lazem
//     te3ady 3ala qawa3ed el aman, el values betemshi ka $n, w el rows betetkteb fe transaction.
test('store: SQL is parameterised and the snapshot uses a transaction', async () => {
  const seen = [];
  const client = { query: async (sql, params) => { seen.push({ sql, params }); return { rows: [] }; }, release() {} };
  const pool = { query: client.query, connect: async () => client };
  const store = createStore(createDb({ pool }));

  await store.upsertSnapshots('2026-11-21', [
    { teamId: TEAM, employeeId: 'e1', status: 'Compliant', reasons: [], overdueCount: 0, expiringCount: 0 },
  ]);
  await store.trend(TEAM, '2026-11-19', '2026-11-21');

  assert.deepStrictEqual(seen.map((q) => q.sql.trim().split(/\s+/)[0]), ['BEGIN', 'INSERT', 'COMMIT', 'SELECT']);
  assert.deepStrictEqual(seen[1].params, ['2026-11-21', TEAM, 'e1', 'Compliant', [], 0, 0]);
  assert.deepStrictEqual(seen[3].params, [TEAM, 'Compliant', '2026-11-19', '2026-11-21']);
});
