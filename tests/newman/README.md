# Newman end-to-end tests

The whole story across the three services, through nginx over HTTPS:

1. The manager (Mona) creates a training that needs a certificate (S1).
2. The manager assigns it to Sara (S1).
3. Sara sees it in her list (S1).
4. Sara marks it completed, and the renewal is created (S1).
5. The dashboard shows Sara as **Non-compliant: CertificateMissing** (S3 reads S1 and S2).
6. Sara uploads her certificate as a PDF. It starts as Pending (S2).
7. The dashboard still shows CertificateMissing, because only Verified certificates count (S3).
8. The manager verifies the certificate (S2).
9. The dashboard shows Sara as **Compliant** (S3).
10. The CSV report contains the training (S3).

Plus invalid cases: a bad token (401), an employee on the manager dashboard (403), a manager of another team (403), a due date in the past (400), an employee verifying her own certificate (403), and `days=500` on the trend (400).

## Run it

Start the stack, load the seed and create the Cognito users (`docs/DEV_SETUP.md`), then from the repo root run:

```
node scripts/run_newman.js
```

The results go to `docs/evidence/newman/summary.md` (a table) and `newman-report.json` (the full report, tokens removed). The Cognito client id and the test password are read from your local `.env` and `cognito.generated.env` files and are never stored in the collection. `local.postman_environment.json` only holds dummy values.

Each run creates one new training (category `NewmanE2E`) and one certificate for Sara, so run it on the local database only.
