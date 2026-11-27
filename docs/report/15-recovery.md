# 15. Recovery approach

| What can fail | How we recover | Target |
|---|---|---|
| A service crashes or a bad deploy | Docker / Elastic Beanstalk restarts the container. A bad version is rolled back to the previous application version (on AWS, Elastic Beanstalk keeps the earlier versions). Every change also stays in Git, so `main` can be redeployed. | minutes |
| A dependency is down (S1 or S2, CloudWatch, SendGrid) | The callers return 502/503 instead of partial data. The log shipper drops one batch with a single warning, and the lines remain in the container logs. Reminders are skipped and retried by the next daily run (`notified_at` prevents duplicates). | automatic |
| A daily job fails | Both jobs are safe to run again. run-check raises or resolves flags without duplicates. The S3 snapshot writes one row per employee per day (upsert), all-or-nothing. Run them again with `node infra/scheduler/scheduler.js --now`. | rerun the same day |
| Database loss or corruption | On AWS: RDS automated daily backups with point-in-time recovery (7 days) plus a manual snapshot before each release. Locally: `infra/db/schema.sql` + `seed.sql` rebuild everything with `node infra/db/load.js all`. | RPO ≤ 24 h (minutes with point-in-time recovery); RTO ≤ 1 h |
| A certificate file deleted or overwritten | The bucket has versioning, so an earlier version can be restored. The SHA-256 stored at upload proves whether a file was changed. | minutes |
| The AWS setup lost (bucket, secrets, log groups, IAM, schedules) | `infra/floci/init.py` and the Cognito script are idempotent and rebuild everything. Secrets are never overwritten, so real values must be put back by hand from the team's password manager. | under 30 minutes |
| A leaked secret | Rotate it in Secrets Manager (new DB password, new SendGrid key, new service-client secret), redeploy, and revoke the old one. The secret scan in CI helps catch it before it is pushed. | same day |

**Tested so far:** recreating the local stack from scratch (fresh clone, `dev.py up`, init, seed), and running each daily job twice without duplicates. **[EVIDENCE NEEDED: one screenshot of the fresh-clone check passing.]**
