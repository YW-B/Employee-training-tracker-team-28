# Evidence: what to run and which screenshots to take

Everything here comes from a real run of our local stack. Never type a result by hand.

## Generated files (run from the repo root, stack up)

| Command | Writes | Report section |
|---|---|---|
| `node tests/security/run_security_tests.js` (run it twice, 16 minutes apart, for T04) | `security_test_results.md`, `raw/` | Security testing |
| `node scripts/run_newman.js` | `newman/summary.md`, `newman/newman-report.json` | Integrated testing |
| `node scripts/setup_log_alarms.js`, then `node scripts/generate_suspicious_activity.js`, wait 10 s, then `node scripts/security_log_queries.js 30` | `logging/security_log_queries.md` | Logging and monitoring |
| `node --test` in `services/common`, `services/dashboard-reports` (and the other services) | terminal output, screenshot it | Unit testing |

## Screenshots to take (save them in `docs/evidence/screenshots/`)

1. `01-login.png`: the sign-in page at https://localhost:8443 (with the MFA step if a manager has MFA).
2. `02-dashboard.png`: the S3 dashboard of Operations (summary cards, trend, attention list).
3. `03-reports.png`: a report with a category, and the history table.
4. `04-csv.png`: the downloaded CSV opened in Excel, showing a `=HYPERLINK` training name as plain text.
5. `05-certificate-upload.png` and `06-verify.png`: S2 upload, then the manager verifying it.
6. `07-security-results.png`: `security_test_results.md` (or the terminal summary of the suite).
7. `08-newman.png`: the Newman terminal summary (all assertions passed).
8. `09-logs.png`: `docker compose logs s3` showing an `auth_failure` line **without** any token.
9. `10-cloudwatch.png`: the output of `security_log_queries.js` (security events per service and per path).
10. `11-alarm.png`: the alarm and the metric filters listed in Floci (`aws --endpoint-url http://localhost:4566 cloudwatch describe-alarms` and `logs describe-metric-filters --log-group-name /ett/s3`).
11. `12-s3-private.png`: the website returning 404 for `/certificates/`, and a download link showing `X-Amz-Expires=300`.
