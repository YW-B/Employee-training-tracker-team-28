// EN: Tests for aws.js (SigV4 signing) and cloudwatch.js (log shipping). No network: fetch / call are fakes.
//     The signature test uses a value produced by botocore (Amazon's own Python library) for the same input,
//     so our signing is proven to match real AWS, not only Floci.
// Franco: Tests le aws.js (el signing) w cloudwatch.js (ersal el logs). Mafeesh network: fetch w call mozayyafeen.
//     Test el signature beyesta3mel 2eema 3amalha botocore (library Amazon nafsaha) le nafs el input,
//     f el signing bta3na mesabet enno zay AWS el 7a2i2i, mesh Floci bas.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { signRequest, callAws } = require('../aws');
const { createCloudWatchShipper } = require('../cloudwatch');
const { createLogger, defaultWrite } = require('../logging');

test('SigV4 signature matches botocore for the same request', () => {
  const h = signRequest({
    url: 'http://localhost:4566/',
    body: JSON.stringify({ logGroupName: '/ett/s3', logStreamName: 'x' }),
    target: 'Logs_20140328.CreateLogStream',
    service: 'logs',
    region: 'us-east-1',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    now: new Date('2026-11-23T20:11:02Z'),
  });
  assert.strictEqual(h['x-amz-date'], '20261123T201102Z');
  assert.strictEqual(h.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261123/us-east-1/logs/aws4_request, '
    + 'SignedHeaders=content-type;host;x-amz-date;x-amz-target, '
    + 'Signature=d07a2ad8d9438028a6a39bc375b70673e993bac67d1a0b8dfe7d30bbc819e0e4');
});

// EN: the secret key is used to sign, but it never travels in the request.
// Franco: el secret key beyetesta3mel fel signing bas, 3omro ma beyemshi fel request.
test('callAws never sends the secret key, and reports the AWS error type', async () => {
  let sent;
  const fetchImpl = async (url, opts) => {
    sent = opts;
    return { ok: false, status: 400, text: async () => JSON.stringify({ __type: 'com.amazon#ResourceNotFoundException' }) };
  };
  const config = { endpoint: 'http://floci:4566', region: 'us-east-1', accessKeyId: 'AKIDTEST', secretAccessKey: 'super-secret-value', sessionToken: '' };
  await assert.rejects(callAws('logs', 'Logs_20140328.PutLogEvents', {}, { config, fetchImpl }), (err) => err.awsType === 'ResourceNotFoundException');
  assert.ok(!JSON.stringify(sent).includes('super-secret-value'));
  assert.match(sent.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIDTEST\//);
});

test('shipper creates the stream once, then sends batched lines', async () => {
  const calls = [];
  const shipper = createCloudWatchShipper({ logGroup: '/ett/s3', streamName: 's', call: async (t, p) => { calls.push([t, p]); }, maxBatch: 2, flushEveryMs: 60000 });
  shipper.push('{"event":"a"}');
  shipper.push('{"event":"b"}'); // EN: reaches maxBatch -> flush / Franco: wesel maxBatch -> flush
  await new Promise((r) => setImmediate(r));
  shipper.push('{"event":"c"}');
  await shipper.flush();
  assert.deepStrictEqual(calls.map(([t]) => t), ['Logs_20140328.CreateLogStream', 'Logs_20140328.PutLogEvents', 'Logs_20140328.PutLogEvents']);
  assert.deepStrictEqual(calls[1][1].logEvents.map((e) => e.message), ['{"event":"a"}', '{"event":"b"}']);
  assert.strictEqual(calls[1][1].logGroupName, '/ett/s3');
});

test('an existing stream is fine (ResourceAlreadyExistsException is ignored)', async () => {
  const calls = [];
  const shipper = createCloudWatchShipper({
    logGroup: '/ett/s1',
    call: async (t) => {
      calls.push(t);
      if (t.endsWith('CreateLogStream')) { const e = new Error('exists'); e.awsType = 'ResourceAlreadyExistsException'; throw e; }
    },
    flushEveryMs: 60000,
  });
  shipper.push('x');
  await shipper.flush();
  assert.deepStrictEqual(calls, ['Logs_20140328.CreateLogStream', 'Logs_20140328.PutLogEvents']);
});

// EN: CloudWatch down must never break the service: no throw, one warning, the queue is not stuck.
// Franco: CloudWatch wa2e3 3omro ma ykassar el service: mafeesh throw, warning wa7ed, w el queue mesh wa2fa.
test('CloudWatch down: no exception, exactly one warning, later batches still tried', async () => {
  const warnings = [];
  let attempts = 0;
  const shipper = createCloudWatchShipper({ logGroup: '/ett/s2', call: async () => { attempts += 1; throw new Error('ECONNREFUSED'); }, warn: (m) => warnings.push(m), flushEveryMs: 60000 });
  shipper.push('one');
  await shipper.flush();
  shipper.push('two');
  await shipper.flush();
  assert.strictEqual(warnings.length, 1);
  assert.match(warnings[0], /not reachable/);
  assert.strictEqual(attempts, 2);
  assert.strictEqual(shipper.queue.length, 0);
});

test('at most maxQueue lines wait in memory (oldest dropped first)', () => {
  const shipper = createCloudWatchShipper({ logGroup: '/ett/s1', call: async () => new Promise(() => {}), maxQueue: 3, maxBatch: 100, flushEveryMs: 60000 });
  for (const n of [1, 2, 3, 4, 5]) shipper.push(String(n));
  assert.deepStrictEqual(shipper.queue.map((e) => e.message), ['3', '4', '5']);
});

// EN: what reaches CloudWatch is the redacted line from the logger: a token in a field never leaves.
// Franco: elly beyewsal CloudWatch howa el satr el mamsoo7 men el logger: token fe field 3omro ma beytla3.
test('logger + shipper: tokens are redacted before shipping', async () => {
  const shipped = [];
  const shipper = createCloudWatchShipper({ logGroup: '/ett/s3', call: async (t, p) => { if (p.logEvents) shipped.push(...p.logEvents); }, flushEveryMs: 60000 });
  const logger = createLogger('dashboard-reports', { write: (line) => shipper.push(line) });
  logger.warn('auth_failure', { authorization: 'Bearer abc.def.ghi', note: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln' });
  await shipper.flush();
  const text = JSON.stringify(shipped);
  assert.ok(!text.includes('abc.def.ghi'));
  assert.ok(!text.includes('eyJhbGci'));
  assert.match(text, /auth_failure/);
});

test('defaultWrite only ships when CLOUDWATCH_LOG_GROUP is set', () => {
  assert.strictEqual(defaultWrite({}).length, 1);
  assert.strictEqual(typeof defaultWrite({ CLOUDWATCH_LOG_GROUP: '/ett/s1' }), 'function');
});
