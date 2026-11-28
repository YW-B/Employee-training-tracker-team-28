// EN: Shows that SNS really delivers, without a real e-mail. It creates an SQS queue "ett-sns-peek",
//     subscribes it to both SNS topics, then prints every message that arrived.
//     Run from the repo root:
//       node scripts/sns_peek.js --test   (subscribe, publish one test message to each topic, print them)
//       node scripts/sns_peek.js          (subscribe + print whatever arrived, e.g. after the 01:30 UTC
//                                          snapshot job or after the security alarm fired)
// Franco: Beyesbet en SNS beywassal fe3lan, men gheir e-mail 7a2i2i. Beye3mel SQS queue "ett-sns-peek",
//     beye3melaha subscribe lel 2 SNS topics, w ba3d keda beyetba3 kol resala wesslet.
//     --test = beyeb3at resala tagreebeya le kol topic el awel (a7san 7aga lel screenshot).
'use strict';
const { callAwsQuery } = require('../services/common/aws');
const { hostAwsConfig } = require('./aws_host_config');

const SQS = '2012-11-05'; // EN: SQS API version / Franco: version el SQS
const TOPICS = ['ett-security-alerts', 'ett-compliance-daily'];
const QUEUE = 'ett-sns-peek';

const tag = (xml, name) => [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => m[1]);
const unxml = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

async function main() {
  const config = hostAwsConfig();
  const q = await callAwsQuery('sqs', 'CreateQueue', { QueueName: QUEUE }, { config, version: SQS });
  const queueUrl = tag(q, 'QueueUrl')[0];
  const attrs = await callAwsQuery('sqs', 'GetQueueAttributes', { QueueUrl: queueUrl, 'AttributeName.1': 'QueueArn' }, { config, version: SQS });
  const queueArn = tag(attrs, 'Value')[0];

  // EN: CreateTopic returns the ARN of an existing topic, so this also finds the topics init.py made.
  // Franco: CreateTopic beyrage3 el ARN law el topic mawgood, f keda bnla2y el topics elly init.py 3amalha.
  for (const name of TOPICS) {
    const arn = tag(await callAwsQuery('sns', 'CreateTopic', { Name: name }, { config }), 'TopicArn')[0];
    await callAwsQuery('sns', 'Subscribe', { TopicArn: arn, Protocol: 'sqs', Endpoint: queueArn }, { config });
    console.log(`subscribed ${QUEUE} to ${arn}`);
    if (process.argv.includes('--test')) {
      await callAwsQuery('sns', 'Publish', { TopicArn: arn, Subject: `ETT test (${name})`, Message: `Test message for ${name} sent at ${new Date().toISOString()}` }, { config });
      console.log(`published a test message to ${name}`);
    }
  }

  let count = 0;
  for (let round = 0; round < 5; round += 1) {
    const r = await callAwsQuery('sqs', 'ReceiveMessage', { QueueUrl: queueUrl, MaxNumberOfMessages: '10', WaitTimeSeconds: '1' }, { config, version: SQS });
    const bodies = tag(r, 'Body');
    if (!bodies.length) break;
    for (const [i, body] of bodies.entries()) {
      count += 1;
      const msg = JSON.parse(unxml(body)); // EN: SNS wraps the text in a JSON envelope / Franco: SNS beylef el text fe JSON
      console.log(`\n--- message ${count}  topic: ${msg.TopicArn.split(':').pop()}  subject: ${msg.Subject || '-'}`);
      console.log(msg.Message);
      await callAwsQuery('sqs', 'DeleteMessage', { QueueUrl: queueUrl, ReceiptHandle: tag(r, 'ReceiptHandle')[i] }, { config, version: SQS });
    }
  }
  console.log(count ? `\n${count} message(s) delivered by SNS.` : '\nNo messages yet: trigger the snapshot or the alarm, then run this again.');
}

main().catch((err) => { console.log(`FAIL ${err.message}`); process.exit(1); });
