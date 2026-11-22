// EN: Unit tests for src/compliance.js. Every expected value is calculated by hand; "today" is fixed to 2026-11-21.
//     Uses Node's built-in test runner: run with `npm test` (node --test).
// Franco: Unit tests le src/compliance.js. Kol natiga mestanneyinha 7asebnaha b-eedena; "today" sabet 2026-11-21.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const {
  isOverdue, evaluateEmployee, evaluateTeam, complianceRate, attentionOrder, flagsFromContract,
} = require('../src/compliance');

const TODAY = '2026-11-21';
const load = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));

// EN: Small builders so every table row stays one readable line.
// Franco: Builders so8ayyara 3ashan kol satr fel table yeb2a wa7ed w yetqere b-sohoola.
const asg = (due, completed = null, category = 'Safety') =>
  ({ employeeId: 'e1', trainingId: 'tr', category, dueDate: due, completedAt: completed });
const flag = (type, expiry = null, status = 'open', category = 'Safety') =>
  ({ employeeId: 'e1', trainingId: 'tr', category, type, expiryDate: expiry, status });

// ---------- isOverdue ----------
// EN: Overdue = due before today AND not completed. Due today and completed-late are NOT overdue.
// Franco: Overdue = el due abl el naharda W mesh mekhallas. El due el naharda w elly khallas met2akhar MESH overdue.
const overdueCases = [
  ['yesterday, open', asg('2026-11-20'), true],
  ['due today', asg('2026-11-21'), false],
  ['due tomorrow', asg('2026-11-22'), false],
  ['completed late', asg('2026-11-01', '2026-11-10T08:00:00Z'), false],
  ['completed on time', asg('2026-11-01', '2026-10-30T08:00:00Z'), false],
];
for (const [name, a, expected] of overdueCases) {
  test(`isOverdue: ${name}`, () => assert.strictEqual(isOverdue(a, TODAY), expected));
}

// ---------- evaluateEmployee ----------
// EN: One row per rule / edge case: [name, assignments, flags, expected result].
// Franco: Satr le kol rule aw edge case.
const C = 'Compliant';
const N = 'Non-compliant';
const res = (status, reasons, expiringSoon, daysOverdueMax, daysExpiredMax, soonestExpiry) =>
  ({ status, reasons, expiringSoon, daysOverdueMax, daysExpiredMax, soonestExpiry });
const employeeCases = [
  ['no data at all -> Compliant', [], [], res(C, [], false, 0, 0, null)],
  ['due today, not completed -> still Compliant', [asg('2026-11-21')], [], res(C, [], false, 0, 0, null)],
  ['completed late -> Compliant', [asg('2026-11-01', '2026-11-10T08:00:00Z')], [], res(C, [], false, 0, 0, null)],
  // EN: due 2026-11-11, open -> 21 - 11 = 10 days overdue
  // Franco: el due 2026-11-11 w lessa maftoo7 -> 21 - 11 = 10 ayam overdue
  ['one overdue (10 days)', [asg('2026-11-11')], [], res(N, ['OverdueTraining'], false, 10, 0, null)],
  // EN: 10 and 51 days (2026-10-01 -> 2026-11-21 = 30 + 21) -> max 51
  // Franco: 10 w 51 yom (2026-10-01 -> 2026-11-21 = 30 + 21) -> el akbar 51
  ['two overdue, max wins', [asg('2026-11-11'), asg('2026-10-01')], [], res(N, ['OverdueTraining'], false, 51, 0, null)],
  ['Missing flag', [], [flag('Missing')], res(N, ['CertificateMissing'], false, 0, 0, null)],
  // EN: expired 2026-10-22 -> 9 (rest of Oct) + 21 = 30 days
  // Franco: entaha 2026-10-22 -> 9 (ba2y October) + 21 = 30 yom
  ['Expired flag (30 days)', [], [flag('Expired', '2026-10-22')], res(N, ['CertificateExpired'], false, 0, 30, null)],
  ['resolved flag is ignored', [], [flag('Missing', null, 'resolved')], res(C, [], false, 0, 0, null)],
  ['expiring soon stays Compliant, soonest wins', [], [flag('ExpiringSoon', '2026-12-10'), flag('ExpiringSoon', '2026-12-01')],
    res(C, [], true, 0, 0, '2026-12-01')],
  ['two reasons, fixed order', [asg('2026-11-11')], [flag('Missing')],
    res(N, ['OverdueTraining', 'CertificateMissing'], false, 10, 0, null)],
  ['all three reasons + expiring soon', [asg('2026-11-20')],
    [flag('Expired', '2026-11-01'), flag('Missing'), flag('ExpiringSoon', '2026-12-01')],
    res(N, ['OverdueTraining', 'CertificateMissing', 'CertificateExpired'], true, 1, 20, '2026-12-01')],
];
for (const [name, assignments, flags, expected] of employeeCases) {
  test(`evaluateEmployee: ${name}`, () => assert.deepStrictEqual(evaluateEmployee(assignments, flags, TODAY), expected));
}

// ---------- complianceRate ----------
// EN: Rate = compliant / all x 100, 1 decimal. Empty team must return 0, not crash.
// Franco: El nesba = compliant / el kol x 100, rakam 3ashari wa7ed. Team fady lazem yerga3 0 mesh yewa22a3.
const rows = (c, n) => [...Array(c).fill({ status: C }), ...Array(n).fill({ status: N })];
const rateCases = [[0, 0, 0], [3, 0, 100], [0, 4, 0], [1, 2, 33.3], [2, 1, 66.7], [1, 7, 12.5]];
for (const [c, n, expected] of rateCases) {
  test(`complianceRate: ${c} compliant, ${n} non-compliant -> ${expected}`, () =>
    assert.strictEqual(complianceRate(rows(c, n)), expected));
}

// ---------- attentionOrder ----------
const row = (employeeId, status, overdue = 0, expired = 0, soonest = null) =>
  ({ employeeId, status, daysOverdueMax: overdue, daysExpiredMax: expired, expiringSoon: soonest !== null, soonestExpiry: soonest });

// EN: full ranking: worst non-compliant first, then expiring soon by date.
// Franco: el tarteeb kollo: el aswa2 non-compliant el awel, ba3den elly hayekhlas bel tareekh.
test('attentionOrder: ranking', () => {
  const input = [
    row('ok', C), // EN: fully OK -> left out / Franco: tamam khales -> mesh beyedkhol
    row('soon-late', C, 0, 0, '2026-12-15'),
    row('missing', N), // EN: 0 days -> last of the non-compliant / Franco: 0 yom -> akher el non-compliant
    row('overdue5', N, 5),
    row('expired40', N, 0, 40),
    row('soon-early', C, 0, 0, '2026-11-25'),
    row('both', N, 12, 3), // EN: ranked by the bigger number (12) / Franco: beyetrattab bel rakam el akbar (12)
  ];
  assert.deepStrictEqual(attentionOrder(input).map((r) => r.employeeId),
    ['expired40', 'both', 'overdue5', 'missing', 'soon-early', 'soon-late']);
});

// EN: Ties keep a stable order by employeeId, whatever the input order is.
// Franco: Law fi ta3adol, el tarteeb beyfdal sabet bel employeeId.
test('attentionOrder: ties sorted by employeeId', () => {
  const input = [row('e3', N, 7), row('e1', N, 0, 7), row('e9', C, 0, 0, '2026-12-01'), row('e2', C, 0, 0, '2026-12-01')];
  assert.deepStrictEqual(attentionOrder(input).map((r) => r.employeeId), ['e1', 'e3', 'e2', 'e9']);
});

test('attentionOrder: empty team', () => assert.deepStrictEqual(attentionOrder([]), []));

// ---------- whole team from mocked S1/S2 fixtures (contract shapes) ----------
// EN: Hand calculation for the fixture team (today 2026-11-21):
//     e1 Alice  completed on time + future due; only a PENDING cert expiring -> Compliant, NOT expiring (Pending never counts)
//     e2 Bob    due today, open; Verified cert valid to 2027              -> Compliant
//     e3 Carol  completed late + Verified cert expiring 2026-12-05 (14 days) -> Compliant, expiring soon
//     e4 Dan    Safety due 2026-11-11 open (10 days) + Privacy cert Missing -> Non-compliant, 2 reasons
//     e5 Eve    Privacy cert expired 2026-10-22 (30 days)                 -> Non-compliant
//     e6 Frank  Verified cert expiring 2026-11-30 (Rejected one ignored)  -> Compliant, expiring soon
//     Rate = 4 / 6 = 66.7. Attention = e5 (30), e4 (10), e6 (11-30), e3 (12-05).
// Franco: 7esab b-eedena lel team elly fel fixtures; el nesba 4/6 = 66.7 w el attention e5, e4, e6, e3.
function team() {
  const employees = load('s1_employees.json');
  const assignments = load('s1_assignments.json');
  const flags = flagsFromContract(load('s2_compliance.json'), assignments, TODAY);
  return { employees, assignments, flags };
}

test('flagsFromContract: S2 answer -> internal flags', () => {
  const { flags } = team();
  const brief = flags.map((f) => `${f.employeeId}:${f.type}:${f.category}:${f.expiryDate}`).sort();
  assert.deepStrictEqual(brief, [
    'e3:ExpiringSoon:Safety:2026-12-05',
    'e4:Missing:Privacy:null',
    'e5:Expired:Privacy:2026-10-22',
    'e6:ExpiringSoon:Privacy:2026-11-30',
  ]);
});

test('evaluateTeam: whole team from fixtures', () => {
  const { employees, assignments, flags } = team();
  const result = evaluateTeam(employees, assignments, flags, TODAY);
  const by = Object.fromEntries(result.map((r) => [r.employeeId, r]));

  assert.deepStrictEqual(result.map((r) => r.employeeId), ['e1', 'e2', 'e3', 'e4', 'e5', 'e6']);
  assert.strictEqual(by.e1.status, C);
  assert.strictEqual(by.e1.expiringSoon, false);
  assert.strictEqual(by.e2.status, C);
  assert.strictEqual(by.e3.status, C);
  assert.strictEqual(by.e3.soonestExpiry, '2026-12-05');
  assert.deepStrictEqual(by.e4.reasons, ['OverdueTraining', 'CertificateMissing']);
  assert.strictEqual(by.e4.daysOverdueMax, 10);
  assert.deepStrictEqual(by.e5.reasons, ['CertificateExpired']);
  assert.strictEqual(by.e5.daysExpiredMax, 30);
  assert.strictEqual(by.e6.soonestExpiry, '2026-11-30');

  assert.strictEqual(complianceRate(result), 66.7);
  assert.deepStrictEqual(attentionOrder(result).map((r) => r.employeeId), ['e5', 'e4', 'e6', 'e3']);
});

// EN: Category rate looks only at that category's assignments/flags.
//     Safety: only e4 is overdue -> 5/6 = 83.3. Privacy: e4 Missing + e5 Expired -> 4/6 = 66.7, and e4's reason
//     is only CertificateMissing (his overdue item is Safety). Unknown category -> everyone Compliant -> 100.
// Franco: Nesbet el category betbos 3ala assignments/flags el category di bas.
const categoryCases = [['Safety', 83.3, ['OverdueTraining']], ['Privacy', 66.7, ['CertificateMissing']], ['Nonexistent', 100, []]];
for (const [category, rate, e4Reasons] of categoryCases) {
  test(`evaluateTeam: category ${category}`, () => {
    const { employees, assignments, flags } = team();
    const result = evaluateTeam(employees, assignments, flags, TODAY, category);
    assert.strictEqual(complianceRate(result), rate);
    assert.deepStrictEqual(result.find((r) => r.employeeId === 'e4').reasons, e4Reasons);
  });
}

test('evaluateTeam: empty team', () => {
  const result = evaluateTeam([], [], [], TODAY);
  assert.deepStrictEqual(result, []);
  assert.strictEqual(complianceRate(result), 0);
  assert.deepStrictEqual(attentionOrder(result), []);
});
