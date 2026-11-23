# 7. Threat model

The full threat model, with the trust boundaries, every control's code location and the test that proves it, is in `docs/THREAT_MODEL.md`. This is the summary. As the TA pointed out, **a stolen token is stopped by JWT validation, short token expiry and MFA, not by role checks**. Role checks only limit what a valid token can reach.

| # | Threat | Category | Control we implemented | Proven by |
|---|---|---|---|---|
| T1 | Stolen or forged access token | Identity | JWT checked on every request (`services/common/auth.js`): RS256 signature against the Cognito JWKS, issuer, client id, `token_use`, expiry. `alg: none` and HS256 are refused. 15-minute access tokens. MFA for managers. Tokens never logged. | auth unit tests; security tests T04, T05 |
| T2 | Role or team escalation (Employee on manager routes, manager on another team) | API | Role from the signed token only; team ownership checked through S1 `GET /api/teams` on every S2 and S3 team route | T06–T09 |
| T3 | IDOR: changing an id in the URL | API | Ownership checks on employees, assignments, certificates and report history; ids from the token for self-service routes | T10, S3 report-history tests |
| T4 | SQL injection | API / data | All SQL through `db.js`, which refuses quoted or stacked SQL; input validated first | db tests; T12 |
| T5 | Malicious or oversized upload | API | Magic-byte allow-list, 5 MB limit (413/415), random storage key, download only as an attachment through a pre-signed URL | T11, T13 |
| T6 | Public or misconfigured storage | Cloud config | Private bucket with Block Public Access, KMS and versioning; only S2's IAM role can reach it; 5-minute pre-signed URLs | T15 (and section 16 for what Floci does not enforce) |
| T7 | Leaked secrets | Cloud config / data | Secrets Manager, read through each service's IAM role; `.env` is local only and git-ignored; secret scan with `scripts/secret_review.js` (CI scan: see section 8) | T14 |
| T8 | Sensitive data in logs | Data | Logger redacts tokens, passwords and Authorization headers; only the path is logged (no query, body or headers) | logging tests; section 11 |
| T9 | Tampered or wrong compliance results (half numbers, formula injection in CSV, duplicate snapshots) | Data integrity | 502/503 instead of partial numbers; snapshot written in one transaction, one row per employee per day; CSV cells escaped; only Verified certificates count | S3 tests; T16 |
