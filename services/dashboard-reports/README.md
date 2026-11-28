# Service 3: Manager Dashboard & Reports (Yahia)

Decides who is **Compliant** from Service 1's assignments and Service 2's certificates and flags. It also serves the team dashboard, the attention list, the 30-day trend, reports by category with CSV export, and report history. The endpoints are in `docs/API_CONTRACT.md` section 6.

## AWS services used by Service 3

| AWS service | What Service 3 does with it | Code |
|---|---|---|
| **AWS Secrets Manager** | At start-up S3 reads its database login (`svc_s3` and its password) from the secret **`ett/db/s3`**, so the password is not kept in the container. It refuses to start if the secret is missing (fail closed), and it refuses any role other than `svc_s3` (never the admin user or another service's role). | `src/dbSecret.js`, `src/server.js`, `scripts/put-db-secret.js` |
| **Amazon CloudWatch** (Logs, metric filters, alarms) | Every JSON log line (tokens already removed) is sent to the log group `/ett/s3`. The metric filter counts 401/403 events, and the alarm `ett-repeated-auth-failures` fires at 5 or more within 5 minutes. `scripts/security_log_queries.js` reads the security events back. | `services/common/cloudwatch.js`, `scripts/setup_log_alarms.js`, `scripts/security_log_queries.js` |
| **Amazon Cognito** | Every endpoint accepts only a valid Cognito access token (Manager role, or the Service client for the snapshot job). The shared frontend shell signs people in with Cognito, including the MFA code step for managers, and signs them out with GlobalSignOut. | `services/common/auth.js` (used), `frontend/common/auth.js` |
| **Amazon RDS for PostgreSQL** (design; local Postgres) | S3's own tables `compliance_snapshots` and `report_runs`, reached only with the least-privilege role `svc_s3` | `src/store.js`, `infra/db/schema.sql` |
| **Amazon SNS** (notifications) | After the daily snapshot is saved, S3 publishes one short summary to the topic **`ett-compliance-daily`**: per team, compliant/total and the rate. Only team totals go out, never employee names or IDs. If SNS fails, the snapshot is still saved and the job still answers 200; S3 logs `daily_summary_failed`. The CloudWatch alarm `ett-repeated-auth-failures` notifies a second topic, **`ett-security-alerts`**. `scripts/sns_peek.js` subscribes an SQS queue to both topics to show the messages arriving. | `src/notify.js`, `src/dashboard.js`, `scripts/setup_log_alarms.js`, `scripts/sns_peek.js` |
| **AWS IAM** (design) | S3's role may read only `ett/db*` and `ett/service-client`, write only `/ett/s3`, and publish only to `ett-compliance-daily` (`infra/iam/s3-policy.json`). Floci does not enforce IAM; see `docs/LIMITATIONS.md`. | `infra/iam/s3-policy.json` |

AWS calls are signed with Signature Version 4 in `services/common/aws.js` (no npm packages). The signature matches Amazon's own botocore library (see `services/common/test/cloudwatch.test.js`).

## Local setup (after `python scripts/dev.py up`, `dev.py init` and `node infra/db/load.js all`)

```
node services/dashboard-reports/scripts/put-db-secret.js   # creates ett/db/s3 (password from .env, not printed)
docker compose restart s3                                  # S3 reads the secret at start-up
```

Floci keeps secrets in memory, so run the script again after Floci restarts. Inside the Docker image (`NODE_ENV=production`) the secret is always read. Local `npm test` doesn't need it. To switch it off, set `DB_SECRET_ID=none`.

## Tests

`npm test` (Node's built-in runner, 97 tests): compliance rules with hand-calculated tables; every endpoint (200, 400, 401, 403, 404, 502, 503); snapshot idempotency; CSV injection; reading the Secrets Manager login (fail closed, least privilege, no password in errors or logs); the SNS daily summary (team totals only, published after the save, an SNS failure never fails the job).
