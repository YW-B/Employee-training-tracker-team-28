// EN: Creates the security monitoring in CloudWatch: on each log group (/ett/s1, /ett/s2, /ett/s3) a metric
//     filter that counts auth_failure (401) and forbidden (403) lines into the metric ETT/SecurityFailures,
//     and one alarm when there are 5 or more in 5 minutes. Safe to run again (same names are overwritten).
//     Run from the repo root (stack up, init.py done):   node scripts/setup_log_alarms.js
// Franco: Beye3mel el monitoring el amny fe CloudWatch: 3ala kol log group metric filter beye3ed sotoor
//     auth_failure (401) w forbidden (403) fel metric ETT/SecurityFailures, w alarm wa7ed law 5 aw aktar fe
//     5 da2aye2. Momken yeshtaghal tany (nafs el asamy betetkteb fo2 ba3d).
'use strict';
const { callAws, callAwsQuery } = require('../services/common/aws');
const { hostAwsConfig, LOG_GROUPS } = require('./aws_host_config');

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
  try {
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
    }, { config });
    console.log('OK   alarm ett-repeated-auth-failures (>= 5 in 5 minutes)');
  } catch (err) {
    failed = true;
    console.log(`FAIL alarm: ${err.message}`);
  }
  if (failed) console.log('Some parts failed: write what does not work in docs/LIMITATIONS.md.');
  process.exit(failed ? 1 : 0);
}

main();
