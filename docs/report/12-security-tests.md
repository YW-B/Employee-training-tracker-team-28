# 12. Security test table

Run with `node tests/security/run_security_tests.js` against the running stack, through nginx over HTTPS. The **Actual** and **Result** columns are copied from `docs/evidence/security_test_results.md`, which that run writes. Nothing is typed by hand. Raw responses, with tokens removed, are in `docs/evidence/raw/`.

| ID | Scenario | Expected | Actual | Result |
|---|---|---|---|---|
| T01 | No token on S1 `GET /api/assignments/me` | 401 | [from run] | [from run] |
| T02 | No token on S2 `GET /api/certificates/me` | 401 | [from run] | [from run] |
| T03 | No token on S3 dashboard summary | 401 | [from run] | [from run] |
| T04 | Expired real Cognito token on S1, S2 and S3 | 401 ×3 | [from run] | [from run] |
| T05 | Tampered token (Employee changes group to Manager) and unsigned `alg: none` token | 401, 401 | [from run] | [from run] |
| T06 | Employee calls `POST /api/assignments` | 403 | [from run] | [from run] |
| T07 | Employee calls `PATCH /api/certificates/{id}/verify` | 403 | [from run] | [from run] |
| T08 | Employee opens the S3 dashboard | 403 | [from run] | [from run] |
| T09 | Laboratory's manager asks for Operations' dashboard and report | 403, 403 | [from run] | [from run] |
| T10 | IDOR: Sara reads Ahmed's profile (S1) and a certificate (S2) | 403, 403 | [from run] | [from run] |
| T11 | Past due date (S1), `.exe` renamed to `.pdf` (S2), bad `?status=` (S3) | 400, 415, 400 | [from run] | [from run] |
| T12 | SQL-injection string in query parameters | no 500, no rows leak | [from run] | [from run] |
| T13 | 5.5 MB upload | 413 | [from run] | [from run] |
| T14 | Secret review of every tracked file | PASS | [from run] | [from run] |
| T15 | Storage without a pre-signed URL; download link signed, expiry ≤ 300 s | 404; signed ≤ 300 s | [from run] | [from run] |
| T16 | Training named `=HYPERLINK(...)` in the CSV export | escaped with `'` | [from run] | [from run] |
| T17 | HTTP redirected to HTTPS; HSTS, CSP, nosniff | present | [from run] | [from run] |

**[EVIDENCE NEEDED: run the suite twice, 16 minutes apart (for T04), copy the Actual and Result columns from `docs/evidence/security_test_results.md`, and add a screenshot of the summary line (screenshot 07).]**

Each service also has its own security tests (for example `docs/evidence/s1/security_results.md` for S1), and the shared auth module has unit tests for every token attack.
