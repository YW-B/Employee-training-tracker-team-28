// EN: Tests for the report endpoints (6.6-6.9) and the CSV helper. "Today" is fixed to 2026-11-21.
//     Expected rows are worked out by hand from the fixtures (one row per assignment a1..a8).
// Franco: Tests le endpoints el reports w helper el CSV. "Today" = 2026-11-21.
//     El rows el mestanneyinha ma7sooba b-eedena men el fixtures (satr le kol assignment a1..a8).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { csvCell, toCsv } = require('../src/csv');
const {
  TEAM, OTHER_TEAM, token, fakeStore, call,
} = require('../test-support/helpers');

const base = `/api/reports/teams/${TEAM}`;

// ---------- the JSON report ----------
// EN: hand calculation (today 2026-11-21):
//     a1 Alice Fire  Completed, no flag            -> Valid,            Compliant
//     a2 Alice GDPR  due 12-15, open               -> Not yet required, Compliant
//     a3 Bob   Fire  due today, open              -> Assigned / Not yet required, Compliant
//     a4 Carol Fire  Completed, expiring 12-05     -> Expiring soon,    Compliant
//     a5 Dan   Fire  due 11-11, open               -> Overdue,          Non-compliant
//     a6 Dan   GDPR  Completed, Missing flag       -> Missing,          Non-compliant
//     a7 Eve   GDPR  Completed, Expired flag       -> Expired,          Non-compliant
//     a8 Frank GDPR  Completed, expiring 11-30     -> Expiring soon,    Compliant
// Franco: 7esab b-eedena le kol assignment (el naharda 2026-11-21).
test('report: one row per assignment with statuses, and a report_runs row', async () => {
  const store = fakeStore();
  const { status, body } = await call(base, { bearer: token(), store });
  assert.strictEqual(status, 200);
  assert.strictEqual(body.teamId, TEAM);
  assert.strictEqual(body.category, null);
  assert.deepStrictEqual(
    body.rows.map((r) => [r.name, r.trainingName, r.assignmentStatus, r.certificateStatus, r.compliance]),
    [
      ['Alice', 'Fire Safety', 'Completed', 'Valid', 'Compliant'],
      ['Alice', 'GDPR Basics', 'Assigned', 'Not yet required', 'Compliant'],
      ['Bob', 'Fire Safety', 'Assigned', 'Not yet required', 'Compliant'],
      ['Carol', 'Fire Safety', 'Completed', 'Expiring soon', 'Compliant'],
      ['Dan', 'Fire Safety', 'Overdue', 'Not yet required', 'Non-compliant'],
      ['Dan', 'GDPR Basics', 'Completed', 'Missing', 'Non-compliant'],
      ['Eve', 'GDPR Basics', 'Completed', 'Expired', 'Non-compliant'],
      ['Frank', 'GDPR Basics', 'Completed', 'Expiring soon', 'Compliant'],
    ],
  );
  // EN: the run is recorded with the caller's employeeId from S1 /api/employees/me (m1), never from the request.
  // Franco: el run beyetsaggel b employeeId el caller men S1 (m1), 3omro ma men el request.
  const run = store.runs.get(body.reportRunId);
  assert.deepStrictEqual([run.teamId, run.category, run.generatedBy, run.rowCount], [TEAM, null, 'm1', 8]);
});

// EN: Privacy only: a2, a6, a7, a8. Dan is Non-compliant in Privacy because of the Missing certificate.
// Franco: Privacy bas: a2, a6, a7, a8. Dan Non-compliant fel Privacy 3ashan el certificate Missing.
test('report: ?category= keeps only that category', async () => {
  const { body } = await call(`${base}?category=Privacy`, { bearer: token() });
  assert.strictEqual(body.category, 'Privacy');
  assert.deepStrictEqual(body.rows.map((r) => [r.name, r.compliance]),
    [['Alice', 'Compliant'], ['Dan', 'Non-compliant'], ['Eve', 'Non-compliant'], ['Frank', 'Compliant']]);
});

test('report: 400 when category is longer than 50 characters (before any other call)', async () => {
  const { status, calls } = await call(`${base}?category=${'x'.repeat(51)}`, { bearer: token() });
  assert.strictEqual(status, 400);
  assert.strictEqual(calls.length, 0);
});

test('report: 401 without a token, 403 for an Employee, 403 for another team, 404 unknown team', async () => {
  assert.strictEqual((await call(base)).status, 401);
  assert.strictEqual((await call(base, { bearer: token({ groups: ['Employee'] }) })).status, 403);
  assert.strictEqual((await call(`/api/reports/teams/${OTHER_TEAM}`, { bearer: token() })).status, 403);
  assert.strictEqual((await call('/api/reports/teams/10000000-0000-4000-8000-000000000099', { bearer: token() })).status, 404);
});

test('report: S2 fails -> 502 and no report_runs row', async () => {
  const store = fakeStore();
  const { status } = await call(base, {
    bearer: token(),
    store,
    overrides: { '/api/compliance': () => ({ ok: false, status: 500, json: async () => ({}) }) },
  });
  assert.strictEqual(status, 502);
  assert.strictEqual(store.runs.size, 0);
});

// ---------- CSV export ----------
test('export: CSV content type, attachment, header row and 8 data rows', async () => {
  const { status, text, headers } = await call(`${base}/export`, { bearer: token(), raw: true });
  assert.strictEqual(status, 200);
  assert.strictEqual(headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.strictEqual(headers.get('content-disposition'), 'attachment; filename="team-report.csv"');
  const lines = text.trimEnd().split('\r\n');
  assert.strictEqual(lines[0], 'Employee,Training,Category,Assignment status,Due date,Certificate status,Compliance');
  assert.strictEqual(lines.length, 9);
  assert.strictEqual(lines[6], 'Dan,GDPR Basics,Privacy,Completed,2026-09-01,Missing,Non-compliant');
});

// EN: an employee whose name is a formula must come out as plain text in the CSV.
// Franco: mowazzaf esmo formula lazem yetla3 ka text 3ady fel CSV.
test('export: CSV injection guard on real data', async () => {
  const evil = [{ id: 'e1', name: '=HYPERLINK("http://evil.example","click")', teamId: 't1' }];
  const { text } = await call(`${base}/export`, {
    bearer: token(),
    raw: true,
    overrides: { [`/api/teams/${TEAM}/employees`]: () => ({ ok: true, status: 200, json: async () => evil }) },
  });
  const firstRow = text.split('\r\n')[1];
  assert.ok(firstRow.startsWith('"\'=HYPERLINK(""http://evil.example"",""click"")"'), firstRow);
});

const cellCases = [
  ['=1+1', "'=1+1"], ['+44', "'+44"], ['-2', "'-2"], ['@SUM(A1)', "'@SUM(A1)"],
  ['plain', 'plain'], ['a,b', '"a,b"'], ['say "hi"', '"say ""hi"""'], [null, ''], [12, '12'],
];
for (const [input, expected] of cellCases) {
  test(`csvCell(${JSON.stringify(input)}) -> ${expected}`, () => assert.strictEqual(csvCell(input), expected));
}

test('toCsv: header + rows, CRLF line ends', () => {
  assert.strictEqual(toCsv([['A', 'a'], ['B', 'b']], [{ a: 1, b: 'x' }]), 'A,B\r\n1,x\r\n');
});

// ---------- history ----------
test('history: lists only runs of the caller\'s teams', async () => {
  const store = fakeStore();
  await store.addReportRun(TEAM, null, 'm1', 8);
  await store.addReportRun(OTHER_TEAM, null, 'm2', 3); // EN: another manager's team / Franco: team manager tany
  const { status, body } = await call('/api/reports/history', { bearer: token(), store });
  assert.strictEqual(status, 200);
  assert.deepStrictEqual(body.map((r) => r.teamId), [TEAM]);
});

test('history delete: 204 for own team, then 404; 403 for another team; 400 bad id', async () => {
  const store = fakeStore();
  const mine = await store.addReportRun(TEAM, null, 'm1', 8);
  const theirs = await store.addReportRun(OTHER_TEAM, null, 'm2', 3);
  const del = (id) => call(`/api/reports/history/${id}`, { method: 'DELETE', bearer: token(), store });

  assert.strictEqual((await del(mine.id)).status, 204);
  assert.strictEqual(store.runs.has(mine.id), false);
  assert.strictEqual((await del(mine.id)).status, 404);
  assert.strictEqual((await del(theirs.id)).status, 403);
  assert.strictEqual(store.runs.has(theirs.id), true);
  assert.strictEqual((await del('not-a-uuid')).status, 400);
});
