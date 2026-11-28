# 8. Security controls

| Area | What we implemented | Where |
|---|---|---|
| **Authentication** | Cognito sign-in (e-mail + password, plus a TOTP MFA step for managers). Every service validates the access token on every request: RS256 signature (JWKS), issuer, client id, `token_use = access`, expiry. Access tokens last 15 minutes, refresh tokens 1 day. Sign-out calls GlobalSignOut. A wrong e-mail and a wrong password give the same message, so nobody can test which accounts exist. | `services/common/auth.js`, `frontend/common/auth.js`, `infra/floci/cognito/cognito_init.js` |
| **Authorization** | Backend role check (Employee, Manager, Service) **and** ownership or team check on every endpoint; 401 or 403 logged as `auth_failure` or `forbidden`. The pages only hide links for convenience. | each service's access module; S3 `teamData.js` |
| **Ownership checks** | Self-service identity always comes from the token, never the request. Managers are limited to their own teams. A manager cannot verify their own certificate. Report-history delete is limited to the caller's teams. | S1, S2, S3 |
| **Least privilege** | One DB role per service, which can only reach its own tables. One IAM role per service (`infra/iam/`): for example, S3's role can read only `ett/db` and `ett/service-client` and write only its own log group, with no bucket access and no SendGrid key. The containers run as the non-root `node` user. | `infra/db/schema.sql`, `infra/iam/*.json`, `docs/IAM_LEAST_PRIVILEGE.md`, Dockerfiles |
| **Secrets handling** | DB passwords, the SendGrid key and the service-client secret are in Secrets Manager, read at run time. **S1 and S3 read their database login from Secrets Manager** (`ett/db/s1`, `ett/db/s3`) and refuse to start without it (fail closed), or with any role other than their own. Configuration comes from environment variables. `.env` is local only, git-ignored, with dummy values in `.env.example`. Secret scanning: gitleaks in CI on every push and pull request (`.github/workflows/secret-scan.yml`), plus `scripts/secret_review.js` (security test T14). | `infra/floci/init.py`, `services/employee-training/src/aws.js`, `services/dashboard-reports/src/dbSecret.js`, `.github/workflows/secret-scan.yml` |
| **Input validation** | UUIDs, dates, enums, lengths and ranges (for example `days` 1–90, category ≤ 50) are validated before any other call. Files are checked by magic bytes, with a 5 MB limit. SQL is parameterised only. CSV formula cells are escaped. The frontend shows data with `textContent` only (no `innerHTML`), so injected HTML never runs. | each service's validation; `services/common/db.js`; `frontend/common/ui.js` |
| **Secure transport** | HTTPS only: HTTP is redirected, HSTS is set, and the Content-Security-Policy allows no inline scripts, plus `X-Content-Type-Options: nosniff` and `frame-ancestors 'none'`. On AWS: CloudFront/ACM certificates, and RDS over TLS. | `infra/nginx/nginx.conf` |
| **Encryption at rest** | KMS default encryption on the certificates bucket, with versioning. RDS encrypted with KMS on AWS. A SHA-256 hash of every file is stored to detect tampering. | `infra/floci/init.py`, S2 |
| **Logging and monitoring** | JSON logs from every service, shipped to CloudWatch Logs (`/ett/s1..s3`). A metric filter counts 401/403, and an alarm fires at 5 or more within 5 minutes. The alarm notifies the SNS topic `ett-security-alerts`. An append-only audit log covers certificate actions, and the `report_exported` event is logged. | `services/common/logging.js`, `cloudwatch.js`, `scripts/setup_log_alarms.js` |

## Shared responsibility

| AWS is responsible for | Our team is responsible for |
|---|---|
| Physical data centres, hardware and the network | Validating every input and returning the right status code |
| Patching the OS and runtime of the managed services (Elastic Beanstalk platform updates, RDS engine patches) | Role and ownership checks in every service, on every request |
| Availability of Cognito, S3, RDS, Secrets Manager, CloudWatch, SNS and KMS | Configuring them safely: private bucket, least-privilege IAM, MFA for managers, short-lived tokens |
| The built-in encryption features and TLS endpoints of AWS services | Keeping secrets out of code and logs, rotating them after a leak, and watching our logs and alarms |

## Why each identity gets only its own permissions

Each service has its own database role and its own IAM role, and each person gets only the actions their role needs. A single broad admin role would be inappropriate. One bug in any service (for example a mistake in the dashboard) would then expose every table, every certificate file and every secret. With separate roles, a compromised service can only reach its own data. The access stays easy to explain and to test, and the database checks (`infra/db/checks.sql`) prove those limits.
