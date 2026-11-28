// EN: Creates the security monitoring in CloudWatch: on each log group (/ett/s1, /ett/s2, /ett/s3) a metric
//     filter that counts auth_failure (401) and forbidden (403) lines into the metric ETT/SecurityFailures,
//     and one alarm when there are 5 or more in 5 minutes. Safe to run again (same names are overwritten).
//     SNS: it also creates two SNS topics: "ett-security-alerts" (the alarm notifies it when it fires) and
//     "ett-compliance-daily" (Service 3 publishes the daily summary to it). If ALERT_EMAIL is set (env or .env),
//     that address is subscribed to both (AWS sends a confirmation e-mail first; Floci does not send real e-mail).
//     Run from the repo root (stack up, init.py done):   node scripts/setup_log_alarms.js
// Franco: Beye3mel el monitoring el amny fe CloudWatch: 3ala kol log group metric filter beye3ed sotoor
//     auth_failure (401) w forbidden (403) fel metric ETT/SecurityFailures, w alarm wa7ed law 5 aw aktar fe
//     5 da2aye2. Momken yeshtaghal tany (nafs el asamy betetkteb fo2 ba3d).
//     SNS: beye3mel kaman 2 SNS topics: "ett-security-alerts" (el alarm bey-ba3atlo lama yedrab) w
//     "ett-compliance-daily" (Service 3 bey-ba3atlo el summary el yomy). Law ALERT_EMAIL mawgood (env aw .env),
//     el e-mail da beye3mel subscribe lel etnein (AWS bey-ba3at e-mail ta2keed el awel; Floci mabey-ba3atsh e-mail 7a2i2i).
'use strict';
const { callAws, callAwsQuery } = require('../services/common/aws');
const path = require('node:path');
const { hostAwsConfig, LOG_GROUPS } = require('./aws_host_config');
const { readEnvFile } = require('../tests/security/lib');

const TOPICS = ['ett-security-alerts', 'ett-compliance-daily'];

// EN: CreateTopic gives back the topic ARN (its full AWS name). Creating an existing topic just returns it.
// Franco: CreateTopic beyrage3 el ARN bta3 el topic (esmo el kamel fe AWS). Law mawgood beyrage3o bas.
async function createTopic(name, config) {
  const xml = await callAwsQuery('sns', 'CreateTopic', { Name: name }, { config });
  const arn = (xml.match(/<TopicArn>([^<]+)<\/TopicArn>/) || [])[1];
  if (!arn) throw new Error('no TopicArn in the answer');
  return arn;
}

async function main() {
  const config = hostAwsConfig();
  let failed = false;
  for (const group of LOG_GROUPS) {
    try {
      // EN: a JSON log line matches when its "event" field is auth_failure OR forbidden.
      // Franco: satr el log beyetfe2 law el field "event" = auth_failure AW forbidden.
      await callAws('logs', 'Logs_20140328.PutMetricFilter', {
        logGroupName: group,
        filterName: 'ett-security-failures',
        filterPattern: '{ ($.event = "auth_failure") || ($.event = "forbidden") }',
        metricTransformations: [{ metricName: 'SecurityFailures', metricNamespace: 'ETT', metricValue: '1', defaultValue: 0 }],
      }, { config });
      console.log(`OK   metric filter on ${group}`);
    } catch (err) {
      failed = true;
      console.log(`FAIL metric filter on ${group}: ${err.message}`);
    }
  }
  // EN: SNS topics first, so the alarm can point at the security topic.
  // Franco: el SNS topics el awel, 3ashan el alarm ye2dar yeshawer 3ala topic el security.
  const arns = {};
  const alertEmail = (process.env.ALERT_EMAIL || readEnvFile(path.join(__dirname, '..', '.env')).ALERT_EMAIL || '').trim();
  for (const name of TOPICS) {
    try {
      arns[name] = await createTopic(name, config);
      console.log(`OK   SNS topic ${name} (${arns[name]})`);
      if (alertEmail) {
        await callAwsQuery('sns', 'Subscribe', { TopicArn: arns[name], Protocol: 'email', Endpoint: alertEmail }, { config });
        console.log(`OK   ${alertEmail} subscribed to ${name} (confirm the e-mail AWS sends)`);
      }
    } catch (err) {
      failed = true;
      console.log(`FAIL SNS topic ${name}: ${err.message}`);
    }
  }
  try {
    // EN: AlarmActions = what happens when the alarm fires: notify the security topic on SNS.
    // Franco: AlarmActions = eh elly ye7sal lama el alarm yedrab: neb3at lel security topic 3ala SNS.
    const actions = arns['ett-security-alerts'] ? { 'AlarmActions.member.1': arns['ett-security-alerts'] } : {};
    await callAwsQuery('monitoring', 'PutMetricAlarm', {
      AlarmName: 'ett-repeated-auth-failures',
      AlarmDescription: '5 or more 401/403 responses within 5 minutes across the three services',
      Namespace: 'ETT',
      MetricName: 'SecurityFailures',
      Statistic: 'Sum',
      Period: '300',
      EvaluationPeriods: '1',
      Threshold: '5',
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      TreatMissingData: 'notBreaching',
      ...actions,
    }, { config });
    console.log(`OK   alarm ett-repeated-auth-failures (>= 5 in 5 minutes)${actions['AlarmActions.member.1'] ? ' -> SNS ett-security-alerts' : ''}`);
  } catch (err) {
    failed = true;
    console.log(`FAIL alarm: ${err.message}`);
  }
  if (failed) console.log('Some parts failed: write what does not work in docs/LIMITATIONS.md.');
  process.exit(failed ? 1 : 0);
}

main();
