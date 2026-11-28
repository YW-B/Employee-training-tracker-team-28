// EN: callAwsQuery sends the right API version for each AWS service (CloudWatch vs SNS).
// Franco: callAwsQuery bey-ba3at el API version el sa7 le kol service (CloudWatch vs SNS).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { callAwsQuery } = require('../aws');

const config = { region: 'us-east-1', endpoint: 'http://floci:4566', accessKeyId: 'test', secretAccessKey: 'test' };

function fakeFetch(seen) {
  return async (url, opts) => { seen.push(new URLSearchParams(opts.body)); return { ok: true, text: async () => '<ok/>' }; };
}

test('callAwsQuery: SNS uses 2010-03-31, CloudWatch uses 2010-08-01', async () => {
  const seen = [];
  await callAwsQuery('sns', 'Publish', { TopicArn: 'arn:x', Message: 'hi' }, { config, fetchImpl: fakeFetch(seen) });
  await callAwsQuery('monitoring', 'DescribeAlarms', {}, { config, fetchImpl: fakeFetch(seen) });
  assert.strictEqual(seen[0].get('Version'), '2010-03-31');
  assert.strictEqual(seen[0].get('Action'), 'Publish');
  assert.strictEqual(seen[1].get('Version'), '2010-08-01');
});

test('callAwsQuery: an AWS error code is shown in the message', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, text: async () => '<Error><Code>NotFound</Code></Error>' });
  await assert.rejects(callAwsQuery('sns', 'Publish', {}, { config, fetchImpl }), /Publish failed: NotFound/);
});
