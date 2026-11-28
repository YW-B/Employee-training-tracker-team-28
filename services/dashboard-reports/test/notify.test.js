// EN: Tests for the SNS daily summary (src/notify.js) and its use in run-snapshot. SNS itself is faked.
// Franco: Tests lel SNS daily summary w este3malo fe run-snapshot. SNS nafso mozayyaf.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createNotifier, buildDailySummary, dailyTopicArn } = require('../src/notify');
const { SERVICE_CLIENT, token, fakeStore, call } = require('../test-support/helpers');

const ARN = 'arn:aws:sns:us-east-1:000000000000:ett-compliance-daily';
const serviceToken = () => token({ groups: [], clientId: SERVICE_CLIENT });

test('dailyTopicArn: empty or "none" means off', () => {
  assert.strictEqual(dailyTopicArn({}), null);
  assert.strictEqual(dailyTopicArn({ SNS_DAILY_TOPIC_ARN: 'none' }), null);
  assert.strictEqual(dailyTopicArn({ SNS_DAILY_TOPIC_ARN: ARN }), ARN);
});

// EN: totals per team, rate rounded to 1 decimal, and NO employee IDs in the text.
// Franco: ar2am le kol team, el nesba le 1 decimal, w MAFEESH IDs mowazzafeen fel text.
test('buildDailySummary: team totals only', () => {
  const rows = [
    { teamId: 't1', employeeId: 'emp-aaa', status: 'Compliant' },
    { teamId: 't1', employeeId: 'emp-bbb', status: 'Non-compliant' },
    { teamId: 't1', employeeId: 'emp-ccc', status: 'Compliant' },
    { teamId: 't2', employeeId: 'emp-ddd', status: 'Compliant' },
  ];
  const { subject, message } = buildDailySummary('2026-11-21', [{ id: 't1', name: 'Operations' }, { id: 't2', name: 'Sales' }, { id: 't3', name: 'Empty' }], rows);
  assert.strictEqual(subject, 'ETT daily compliance 2026-11-21');
  assert.match(message, /All teams: 3\/4 employees compliant/);
  assert.match(message, /Operations: 2\/3 compliant \(66\.7%\)/);
  assert.match(message, /Sales: 1\/1 compliant \(100%\)/);
  assert.match(message, /Empty: 0\/0 compliant \(0%\)/);
  assert.doesNotMatch(message, /emp-/);
});

test('notifier: publishes to the topic with the SNS Publish action', async () => {
  const calls = [];
  const n = createNotifier({ env: { SNS_DAILY_TOPIC_ARN: ARN }, call: async (...args) => { calls.push(args); } });
  assert.strictEqual(await n.publish('2026-11-21', [{ id: 't1', name: 'Ops' }], []), 'sent');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0][0], 'sns');
  assert.strictEqual(calls[0][1], 'Publish');
  assert.strictEqual(calls[0][2].TopicArn, ARN);
});

test('notifier: off when no topic is set (SNS is never called)', async () => {
  let called = false;
  const n = createNotifier({ env: {}, call: async () => { called = true; } });
  assert.strictEqual(await n.publish('2026-11-21', [], []), 'off');
  assert.strictEqual(called, false);
});

test('notifier: SNS error -> "failed" + warning, never throws', async () => {
  const warnings = [];
  const logger = { info() {}, warn: (event, fields) => warnings.push([event, fields]) };
  const n = createNotifier({ env: { SNS_DAILY_TOPIC_ARN: ARN }, logger, call: async () => { throw new Error('Publish failed: NotFound'); } });
  assert.strictEqual(await n.publish('2026-11-21', [], []), 'failed');
  assert.strictEqual(warnings[0][0], 'daily_summary_failed');
});

// EN: run-snapshot calls the notifier once, AFTER saving, with the saved rows; the answer stays the same.
// Franco: run-snapshot beyendah el notifier marra wa7da BA3D el save, b el rows el metsayyeva; el rad zay ma howa.
test('run-snapshot: publishes the daily summary after the save', async () => {
  const store = fakeStore();
  const seen = [];
  const notifier = { publish: async (day, teams, rows) => { seen.push({ day, teams: teams.length, rows: rows.length, saved: store.rows.size }); return 'sent'; } };
  const { status, body } = await call('/api/dashboard/run-snapshot', { method: 'POST', bearer: serviceToken(), store, notifier });
  assert.strictEqual(status, 200);
  assert.deepStrictEqual(body, { snapshotDate: '2026-11-21', teamsProcessed: 1, rowsUpserted: 6 });
  assert.deepStrictEqual(seen, [{ day: '2026-11-21', teams: 1, rows: 6, saved: 6 }]);
});

// EN: SNS down -> the snapshot is still saved and the job still gets 200.
// Franco: SNS wa2e3 -> el snapshot etsayyev bardo w el job beyakhod 200.
test('run-snapshot: SNS failure does not fail the job', async () => {
  const store = fakeStore();
  const notifier = createNotifier({ env: { SNS_DAILY_TOPIC_ARN: ARN }, call: async () => { throw new Error('down'); } });
  const { status } = await call('/api/dashboard/run-snapshot', { method: 'POST', bearer: serviceToken(), store, notifier });
  assert.strictEqual(status, 200);
  assert.strictEqual(store.rows.size, 6);
});

// EN: if S2 fails nothing is saved AND nothing is published.
// Franco: law S2 fashal mafeesh save W mafeesh resala.
test('run-snapshot: no message when the snapshot fails', async () => {
  let published = false;
  const notifier = { publish: async () => { published = true; } };
  const { status } = await call('/api/dashboard/run-snapshot', {
    method: 'POST', bearer: serviceToken(), notifier,
    overrides: { '/api/compliance': () => ({ ok: false, status: 500, json: async () => ({}) }) },
  });
  assert.strictEqual(status, 502);
  assert.strictEqual(published, false);
});
