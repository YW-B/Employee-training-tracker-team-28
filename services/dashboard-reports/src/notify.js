// EN: Amazon SNS for Service 3. After the daily snapshot is saved, S3 publishes ONE short message to the
//     SNS topic "ett-compliance-daily": per team, how many employees are compliant and the compliance rate.
//     Anyone subscribed to the topic (e-mail, SQS queue, ...) receives it, so S3 does not need to know who reads it.
//     Privacy: only team names and totals go out, never employee names, IDs or reasons.
//     Fail-soft: if SNS is down the snapshot is already saved, so we only log a warning (the job still returns 200).
//     Switched on by SNS_DAILY_TOPIC_ARN; empty or "none" = off (unit tests, or a PC without Floci).
// Franco: Amazon SNS le Service 3. Ba3d ma el snapshot el yomy yetsayyev, S3 bey-ba3at resala 2osayyara wa7da
//     lel topic "ett-compliance-daily": le kol team, kam mowazzaf compliant w el nesba. Ay 7ad 3amel subscribe
//     (e-mail, SQS queue, ...) beyestelemha, f S3 mesh me7tag te3raf meen beye2ra.
//     El privacy: asamy el teams w el ar2am bas, 3omrena ma bneb3at asamy mowazzafeen aw IDs aw asbab.
//     Fail-soft: law SNS wa2e3 el snapshot already etsayyev, f bnekteb warning bas (el job beyrage3 200 bardo).
//     Beyeshtaghal b SNS_DAILY_TOPIC_ARN; fady aw "none" = ma2fool (el unit tests, aw gehaz men gheir Floci).
'use strict';
const { callAwsQuery } = require('../../common/aws');

function dailyTopicArn(env = process.env) {
  const arn = (env.SNS_DAILY_TOPIC_ARN || '').trim();
  return arn && arn.toLowerCase() !== 'none' ? arn : null;
}

// EN: builds the message from the rows the snapshot just saved. Pure function (easy to test).
// Franco: bey-bny el resala men el rows elly el snapshot lessa msayyevha. Function pure (sahl nekhtebrha).
function buildDailySummary(day, teams, rows) {
  const lines = teams.map((team) => {
    const mine = rows.filter((r) => r.teamId === team.id);
    const compliant = mine.filter((r) => r.status === 'Compliant').length;
    const rate = mine.length ? Math.round((compliant / mine.length) * 1000) / 10 : 0;
    return `- ${team.name || team.id}: ${compliant}/${mine.length} compliant (${rate}%)`;
  });
  const total = rows.length;
  const compliantAll = rows.filter((r) => r.status === 'Compliant').length;
  return {
    subject: `ETT daily compliance ${day}`,
    message: [
      `Employee Training Tracker - daily compliance snapshot for ${day}`,
      `All teams: ${compliantAll}/${total} employees compliant.`,
      ...lines,
      'Open the Manager dashboard for the details.',
    ].join('\n'),
  };
}

// EN: returns { publish(day, teams, rows) } which never throws: it answers "sent", "off" or "failed".
//     `call` can be replaced in tests (fake SNS).
// Franco: beyrage3 { publish(...) } elly 3omraha ma bet-throw: bterod "sent" aw "off" aw "failed".
//     `call` momken yetghayyar fel tests (SNS mozayyaf).
function createNotifier({ env = process.env, logger = null, call = callAwsQuery } = {}) {
  const topicArn = dailyTopicArn(env);
  return {
    async publish(day, teams, rows) {
      if (!topicArn) return 'off';
      const { subject, message } = buildDailySummary(day, teams, rows);
      try {
        await call('sns', 'Publish', { TopicArn: topicArn, Subject: subject, Message: message });
        if (logger) logger.info('daily_summary_published', { topic: topicArn, snapshotDate: day, teams: teams.length });
        return 'sent';
      } catch (err) {
        if (logger) logger.warn('daily_summary_failed', { topic: topicArn, snapshotDate: day, message: err.message });
        return 'failed';
      }
    },
  };
}

module.exports = { createNotifier, buildDailySummary, dailyTopicArn };
