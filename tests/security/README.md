# Security test suite

Controlled attacks against the **running** stack through nginx (HTTPS). Each test has an ID, a scenario, the expected result, the actual result recorded from the run, and PASS / FAIL. Nothing in the results is typed by hand.

## Run it

1. Start the stack, load the seed and create the Cognito users (see `docs/DEV_SETUP.md`):
   `python scripts/dev.py up`, `node infra/db/load.js all`, `node infra/floci/cognito/cognito_init.js`
2. From the repo root: `node tests/security/run_security_tests.js`
3. Results: `docs/evidence/security_test_results.md`, plus one redacted raw file per test in `docs/evidence/raw/`.
4. **T04 (expired token)** uses a real token saved by an earlier run. Run the suite once, wait **16 minutes**, then run it again.

Settings are read from `.env` (`TEST_USER_PASSWORD`) and `infra/floci/cognito/cognito.generated.env` (`COGNITO_WEB_CLIENT_ID`). The self-signed certificate in `certs/server.crt` is trusted for this run only; TLS checks stay on. Exit code `0` means no test failed.

Unit tests for the helpers (no stack needed): `node --test tests/security/lib.test.js`

## Tests

| ID | Attack | Expected |
|---|---|---|
| T01–T03 | No token on S1, S2, S3 | 401 |
| T04 | Expired real Cognito token | 401 on S1, S2, S3 |
| T05 | Tampered token (Employee edits his group to Manager) and an unsigned `alg: none` token | 401 |
| T06–T08 | Employee calls manager-only routes on S1, S2, S3 | 403 |
| T09 | Manager of one team asks for another team's dashboard and report | 403 |
| T10 | IDOR: employee reads another employee's profile (S1) and certificate (S2) | 403 |
| T11 | Past due date (S1), executable renamed to `.pdf` (S2), bad `?status=` (S3) | 400, 415, 400 |
| T12 | SQL-injection string in query parameters | no 500, no rows leak |
| T13 | 5.5 MB upload | 413 |
| T14 | Secret review of every tracked file (`node scripts/secret_review.js`) | PASS |
| T15 | Storage reached without a pre-signed URL; download link signed with expiry ≤ 300 s | 404; signed, ≤ 300 s |
| T16 | Training named `=HYPERLINK(...)` in the CSV export | cell escaped with `'` |
| T17 | HTTP redirected to HTTPS; HSTS, CSP and nosniff headers | present |

T16 creates one training in the category `SecTest` and assigns it to Sara (seed data), so run the suite on the local database only.
