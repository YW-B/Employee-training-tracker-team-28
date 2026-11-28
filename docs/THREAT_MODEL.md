# Threat model: Employee Training Tracker (Team 28)

Owner: Yahia (report and threat-model lead). Last reviewed: 23 Nov 2026.

This document lists the main threats to the system, the control we built against each one, where the control lives in the code, and the automated test that proves it. It follows the approved Phase 1 proposal (section 6.4) and the TA feedback: **a stolen token is stopped by JWT validation, short token expiry and MFA, not by role checks.**

How to read the **Status** column:

| Status | Meaning |
|---|---|
| **Implemented + tested** | The control is in the repository and an automated test passes against it. |
| **Implemented, AWS-only** | The control is configured, but Floci (our local AWS emulator) does not enforce it. See [Simulation limits](#4-simulation-limits-that-affect-security). |
| **Owned by S1 / S2** | The control belongs to a teammate's service and is verified by that service's security tests. |

---

## 1. System and trust boundaries

```
 Browser (HTML/JS)
     |  HTTPS only (TLS 1.2+, HTTP redirected)            <- boundary 1: the internet
     v
 nginx  ── /api/employees, /api/teams, /api/trainings, /api/assignments ──> S1 Employee & Training (Kerolus)
        ── /api/certificates, /api/compliance ───────────────────────────> S2 Certificate & Compliance (Karim)
        ── /api/dashboard, /api/reports ─────────────────────────────────> S3 Dashboard & Reports (Yahia)
                                                          <- boundary 2: every service checks the JWT itself
 S2, S3 ──(caller's token, 3 s timeout)──> S1 / S2 APIs   <- boundary 3: no service reads another's tables
 S1, S2, S3 ──(own DB role svc_s1 / svc_s2 / svc_s3)──> PostgreSQL (RDS in AWS)
 S2 ──(IAM role, pre-signed URLs)──> private S3 bucket (KMS encrypted)
 S2 ──(API key from Secrets Manager)──> SendGrid       <- boundary 4: external API
 Daily jobs ──(Service token, client credentials)──> S2 run-check, S3 run-snapshot
```

Assets we protect: certificate files (personal documents), employee and team records, compliance results and history, Cognito tokens, and the secrets (database password, SendGrid key, service-client secret).

Actors: an anonymous internet user; a signed-in **Employee**; a signed-in **Manager** of one team; the **Service** client used by the daily jobs; an attacker holding a stolen token, a leaked secret or a malicious file.

---

## 2. Threats, controls and proof

Nine threats, covering identity, data, API/application and cloud configuration.

| # | Threat | Category | Affected part | Control we built | Status |
|---|---|---|---|---|---|
| T1 | **Stolen or forged access token** used to call the API as someone else | Identity | Every endpoint of S1, S2, S3 | JWT validated on every request in `services/common/auth.js`: RS256 signature against the Cognito JWKS, issuer, client id, `token_use = access`, expiry. Only RS256 is accepted (blocks `alg: none` and HS256 confusion). Unknown key or unreachable JWKS fails closed with 401. Access tokens live **15 minutes** and refresh tokens **1 day** (`infra/floci/cognito/cognito_init.js`), so a stolen token stops working quickly. **MFA** (TOTP) is enabled for managers, so a stolen password alone cannot produce a token. Tokens are never logged (T8). **Role checks do not stop token theft**: they only limit what a valid token can reach. | Implemented + tested (MFA: see section 4) |
| T2 | **Role or team escalation**: an Employee calls a Manager route, or a manager asks for another team's data with a valid token | API / application | `/api/dashboard/*`, `/api/reports/*` (S3); assign and verify routes (S1, S2) | Role comes only from the signed token (`cognito:groups`). Every S3 route requires the Manager role, then checks **team ownership through S1** `GET /api/teams`, which returns only the caller's own teams. Not in the list gives 403 (or 404 if the team does not exist). A Service token on a person route gets 403, and a person token on the job route gets 403. All 401/403 are logged as warnings. | Implemented + tested (S3); S1/S2 routes owned by S1 / S2 |
| T3 | **IDOR**: changing an id in the URL to read another employee's certificate, assignment or report history entry | API / application | `GET /api/certificates/{id}`, `/download` (S2); `GET /api/employees/{id}` (S1); `DELETE /api/reports/history/{id}` (S3) | Ids are random UUIDs, and a malformed id gives 400. S3 looks up the report run, then checks its team is one of the caller's teams before deleting (403 otherwise). Self-service routes never trust an `employeeId` from the URL or body: S3 records `generatedBy` from S1 `GET /api/employees/me`. Certificate and employee ownership checks are in S2 and S1. | Implemented + tested (S3); certificates owned by S2, employees by S1 |
| T4 | **SQL injection** through a query value | API / application, Data | All database access | Every query goes through `services/common/db.js`, which **refuses** SQL with quote characters, stacked statements or a wrong `$n` count, so values can only travel as parameters. Inputs are validated first (UUIDs, `status`, `days` 1–90, `category` ≤ 50 characters). | Implemented + tested |
| T5 | **Malicious file upload** (script, executable or oversized file disguised as a PDF) | API / application | `POST /api/certificates` (S2), S3 bucket | File type checked by its first bytes (allow-list PDF, JPG, PNG), 5 MB limit (nginx `client_max_body_size` also caps the request), random object key, files only served as a download through a short pre-signed URL, never executed. | Owned by S2 |
| T6 | **Public or misconfigured storage** exposes every certificate | Cloud configuration | Certificates bucket | `infra/floci/init.py` creates the bucket with Block Public Access (all four settings), versioning and KMS default encryption. Only S2's IAM role may read or write `certificates/*`. Files are reached only through 5-minute pre-signed URLs. | Implemented, AWS-only (section 4) |
| T7 | **Leaked secrets** (database password, SendGrid key, service-client secret) in code, git history or logs | Cloud configuration, Data | Repository, containers, logs | Secrets live in AWS Secrets Manager (`ett/db`, `ett/sendgrid`, `ett/service-client`), created by `init.py`, never overwritten and never printed. Each service reads only its own secrets through its IAM role. Configuration comes from environment variables, and `db.js` fails fast if one is missing. A `.env` file is for local development only: dummy values, never deployed, and listed in `.gitignore` (the root `.gitignore` and `.env.example` are being added by Karim). A secret-scanning step in CI (gitleaks) is owned by Karim. | Implemented (`.gitignore` and scanning: owned by Karim) |
| T8 | **Sensitive data in logs** (tokens, passwords, Authorization headers) | Data | All services, CloudWatch Logs | `services/common/logging.js` redacts secret-named keys at any depth, anything that looks like a JWT and any `Bearer`/`Basic` value. Request logs keep the path only (no query string, no body, no headers). | Implemented + tested |
| T9 | **Wrong or tampered compliance results**: a dependency failure shows half the numbers, a crafted cell runs as a formula in Excel, or the nightly job writes a half day or duplicates | Data (integrity) | S3 dashboard, reports, CSV export, snapshot history | S3 calls S1/S2 with a 3-second timeout and returns **502/503 with no numbers** on any failure. The snapshot job reads every team first and writes all rows in **one transaction**, so a failure writes nothing. The `UNIQUE (employee_id, snapshot_date)` constraint plus an upsert keeps one row per employee per day. CSV cells starting with `=`, `+`, `-` or `@` are prefixed with `'`. Only **Verified** certificates count for compliance (Pending and Rejected never do). | Implemented + tested |

### Where each control is proven

The tests run with `npm test` in each folder (Node's built-in test runner). The `services/dashboard-reports` tests are in the Service 3 pull requests (dashboard endpoints, snapshot and trend, reports and CSV).

| # | Automated tests (file: what it proves) |
|---|---|
| T1 | `services/common/test/auth.test.js`: expired token, tampered payload (Employee changes group to Manager), token signed by an attacker key, wrong issuer, wrong audience, ID token instead of access token, `alg: none`, HS256 confusion, unknown key id, garbage token, token issued in the future, JWKS unreachable: each gives **401**. `services/dashboard-reports/test/dashboard.test.js`: no token, expired token, token signed with another key and token for another app all get 401 on a real S3 route, and S1/S2 are **never called**. |
| T2 | `services/common/test/auth.test.js`: Employee token on a Manager route gives 403; Service token on a person route gives 403. `services/dashboard-reports/test/dashboard.test.js`: Employee gives 403, Service token gives 403, manager of another team gives 403, unknown team gives 404. `snapshot-trend.test.js`: a Manager on the job route gives 403. `reports.test.js`: Employee and other-team manager get 403. |
| T3 | `services/dashboard-reports/test/reports.test.js`: deleting another team's report run gives 403 and the row stays; a non-UUID id gives 400; an unknown id gives 404; `generatedBy` is the id from S1 `/api/employees/me`. `dashboard.test.js`: a non-UUID team id gives 400. |
| T4 | `services/common/test/db-logging-errors.test.js`: concatenated SQL with quotes is refused, stacked queries are refused, the placeholder count must match, an injection string stays a harmless parameter value, unsafe SQL inside a transaction is refused and rolled back. `services/dashboard-reports/test/snapshot-trend.test.js`: S3's own SQL passes the guard, with values sent as `$n` parameters. |
| T8 | `services/common/test/db-logging-errors.test.js`: secret keys redacted at any depth, a JWT or Bearer value inside free text is redacted, a written log line never contains a token, password or Authorization header, a 403 is logged with the path only. |
| T9 | `services/dashboard-reports/test/dashboard.test.js`: S2 failure gives 502 with no `complianceRate` in the body; S1 not answering gives 503. `snapshot-trend.test.js`: running the snapshot twice keeps one row per employee; an S2 failure saves nothing. `reports.test.js`: an employee named `=HYPERLINK(...)` comes out as text in the CSV, and the `csvCell` cases for `=`, `+`, `-`, `@`, commas and quotes. `compliance.test.js`: a Pending certificate never counts as expiring or valid. |
| T5, T7 (scanning) | Owned by S2 / CI: verified by Karim's S2 security tests (magic bytes, 5 MB, 413/415) and the secret-scan job. |
| T6 | Configuration in `infra/floci/init.py`; the read-back results are recorded in `docs/FLOCI_SPIKE.md` (section 4). |

The end-to-end security suite (against the running stack through nginx) adds a second layer of proof for every row. Its results are written to `docs/evidence/security_test_results.md` from a real run.

---

## 3. Shared responsibility

| AWS is responsible for | Our team is responsible for |
|---|---|
| Physical data centres, hardware and the network between them | Validating every input and returning the right status code (400, 401, 403, 404, 413, 415) |
| Patching the operating system and runtime of the managed services (Elastic Beanstalk platform updates, RDS engine patches) | Role and ownership checks in every service's backend, on every request |
| Availability of Cognito, S3, RDS, Secrets Manager, CloudWatch, SNS and KMS | Configuring them safely: private bucket, IAM roles with least privilege, MFA for managers, 15-minute tokens |
| Built-in encryption at rest and the TLS endpoints of AWS services | Keeping secrets out of code and logs, rotating them after a compromise, and reviewing our own logs and alarms |

## Least privilege (and why not one admin role)

Each service has its **own database role** (`svc_s1`, `svc_s2`, `svc_s3`) that can only touch its own tables. S3, for example, can only `SELECT/INSERT/UPDATE` `compliance_snapshots` and `SELECT/INSERT/DELETE` `report_runs` (`infra/db/schema.sql`). Each service also has its **own IAM role** (`infra/iam/*.json`, explained in [`docs/IAM_LEAST_PRIVILEGE.md`](IAM_LEAST_PRIVILEGE.md)): S3's role can read only `ett/db` and `ett/service-client` and write only to its own log group, with no access to the certificates bucket or the SendGrid key.

A single broad admin role would be inappropriate. One bug in any one service (for example in the dashboard) would then expose every secret, every certificate and every table. Separate roles limit the damage of a compromise to that one service and make the access easy to explain and test.

---

## 4. Simulation limits that affect security

AWS is simulated locally with Floci (see [`docs/FLOCI_SPIKE.md`](FLOCI_SPIKE.md) and [`docs/LIMITATIONS.md`](LIMITATIONS.md)). These real findings mean some controls are configured but **not enforced locally**. They would be enforced on real AWS.

| Finding (from a real Floci run) | Threat affected | What we do about it |
|---|---|---|
| S3 objects can be read **without a signature** | T6 | The bucket and policies are configured as on AWS; on real AWS, Block Public Access refuses unsigned reads. We never hand out direct object URLs. |
| Pre-signed URLs **do not expire** in Floci | T5, T6 | S2 still issues 5-minute URLs; on real AWS they expire. |
| Bucket versioning and encryption settings **cannot be read back** (Floci returns HTTP 500) | T6 | `init.py` sets them; on real AWS, check them with `get-bucket-versioning` and `get-bucket-encryption`. |
| IAM policies are **not enforced** by default | T6, T7, least privilege | The same JSON policies are deployed to real IAM and checked with the IAM policy simulator. |
| MFA and token-lifetime behaviour in Floci's Cognito are being verified in the Cognito spike | T1 | The pool is configured for TOTP MFA and 15-minute access tokens; JWT expiry is enforced by our own code either way (`exp` check). |

## 5. Residual risks and next steps

- **A stolen token works until it expires** (at most 15 minutes). Accepted for coursework scale. On real AWS: revoke refresh tokens on sign-out and add CloudFront/WAF rate limiting.
- **No CSRF token**: the API uses Bearer tokens in the `Authorization` header (not cookies), so a third-party site cannot make the browser send them.
- **Repeated 401/403 attempts** are logged as `auth_failure` / `forbidden` warnings. A CloudWatch metric filter and an alarm (5 or more in 5 minutes) were created successfully in the Floci spike, and the logging branch adds them for the services. On 2026-11-28 the alarm moved to ALARM on Floci after the suspicious-activity script. The alarm's action publishes to the SNS topic `ett-security-alerts`, so the team is told without watching the logs. The S3 daily summary on `ett-compliance-daily` carries team totals only (no employee names or IDs), so a subscriber leak does not expose personal data, and S3's role may publish to that one topic only.
- **Denial of service** is out of scope for this project. Timeouts (3 s between services, 5 s per SQL statement) and body-size limits keep one slow part from hanging the rest.
