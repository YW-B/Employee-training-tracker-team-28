# 11. Logging and monitoring evidence

## What is logged

Every service writes one JSON line per request through `services/common/logging.js`:
- the timestamp, service, request id (which follows one action across services), method, **path only**, status, duration, user `sub` and roles;
- `401` responses are logged as `auth_failure` and `403` as `forbidden`, both at warning level;
- `400` is logged as `validation_error` and `5xx` as `server_error`.

There are also business events: S3's `report_exported` (who exported which team's data, ids only) and S2's audit-log rows for certificate actions.

**Never logged:** tokens, passwords, Authorization headers, query strings, request bodies or file contents. The logger redacts secret-named fields and anything that looks like a JWT or Bearer value, at any depth.

## Where it goes

- Each service sends the same lines to **CloudWatch Logs** (`/ett/s1`, `/ett/s2`, `/ett/s3`). S2 and S3 use the shared shipper `services/common/cloudwatch.js`. S1 uses its own writer (`services/employee-training/src/aws.js`, AWS SDK), and it also reads its database login from Secrets Manager. Lines are batched, and a CloudWatch outage never breaks the service.
- `node scripts/setup_log_alarms.js` creates a **metric filter** on each group, which counts `auth_failure` and `forbidden` lines into `ETT/SecurityFailures`. It also creates the **alarm** `ett-repeated-auth-failures`, for 5 or more within 5 minutes, and two **SNS topics**: the alarm's action notifies `ett-security-alerts` (anyone subscribed, for example the team's e-mail in `ALERT_EMAIL`, gets the alert), and Service 3 publishes the daily compliance summary (team totals only) to `ett-compliance-daily`.
- `node scripts/generate_suspicious_activity.js` sends 12 forged-token and 6 wrong-role requests on purpose.
- `node scripts/security_log_queries.js` reads them back, counted per service, per path and per minute.

## Evidence

**[EVIDENCE NEEDED: `docker compose logs s3` showing an `auth_failure` line with no token in it (screenshot 09-logs).]**

**[EVIDENCE NEEDED: the output of `node scripts/security_log_queries.js 30` after `generate_suspicious_activity.js` (`docs/evidence/logging/security_log_queries.md`, screenshot 10-cloudwatch).]**

**[EVIDENCE NEEDED: the metric filters and the alarm listed in Floci (screenshot 11-alarm).]**

**[EVIDENCE NEEDED: the output of `node scripts/sns_peek.js --test`, showing both SNS topics delivering a message (screenshot 13-sns).]**

**Limitation:** Floci creates the alarm but does not evaluate it, so its state stays OK (section 16). On AWS it would move to ALARM and publish to the SNS topic `ett-security-alerts`, which is already set as the alarm's action.
