# 13. Integrated testing

## End-to-end scenario (Newman)

`tests/newman/e2e.postman_collection.json`, run with `node scripts/run_newman.js`, plays the whole story across the three services through nginx with real Cognito sign-ins:

1. The manager creates a training that requires a certificate (S1).
2. The manager assigns it to Sara (S1).
3. Sara sees it in her list (S1).
4. Sara marks it completed, and the renewal is created (S1).
5. The dashboard shows Sara as **Non-compliant: CertificateMissing** (S3, using S1 + S2).
6. Sara uploads a PDF certificate, which starts as Pending (S2).
7. The dashboard still shows CertificateMissing, because Pending does not count (S3).
8. The manager verifies the certificate (S2).
9. The dashboard shows Sara as **Compliant** (S3).
10. The CSV report contains the training (S3).

There are also six invalid cases: a bad token (401), an employee on the dashboard (403), a manager of another team (403), a past due date (400), an employee verifying her own certificate (403), and `days=500` (400).

**[EVIDENCE NEEDED: the assertions total and the table from `docs/evidence/newman/summary.md`, plus screenshot 08 of the Newman terminal summary.]**

## Unit and service tests

Each service has automated tests run with Node's built-in runner (`npm test` in each folder):

| Part | What the tests cover | Result |
|---|---|---|
| `services/common` | JWT attacks (expired, tampered, alg none, wrong issuer/audience...), SQL guard, log redaction, CloudWatch shipping and AWS signing | [EVIDENCE NEEDED: pass count] |
| S1 | lookup, teams, trainings, assignments with Overdue, completion and renewal, security (against a real Postgres) | [EVIDENCE NEEDED: pass count] |
| S2 | upload checks, ownership, verify, compliance flags, daily check | [EVIDENCE NEEDED: pass count] |
| S3 | compliance rules (hand-calculated), every dashboard and report endpoint (200/400/401/403/404/502/503), snapshot idempotency, CSV injection | [EVIDENCE NEEDED: pass count] |
| Frontend shell | sign-in, MFA step, token expiry, API errors | [EVIDENCE NEEDED: pass count] |
| Database | `node infra/db/load.js checks`: role limits and seed rules | [EVIDENCE NEEDED: "All database checks passed"] |

Integration problems we found and fixed while testing:
- The services could not load `services/common` inside Docker, so the build context was moved to the repo root.
- The services were logging in as the admin database user, so each one was switched to its own role.
- The S2 compliance shape was agreed with S3 through the contract, so S3 reads `flagType` and Verified certificates exactly as S2 sends them.
