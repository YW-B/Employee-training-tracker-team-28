# 5. External integration: SendGrid Email API

**What it supports:** expiry reminders. Service 2's daily check (`POST /api/compliance/run-check`, called by the scheduler with a Service token) does three things:
- re-evaluates certificate validity;
- raises and resolves Missing and Expired flags;
- e-mails the employee through the SendGrid v3 API (`https://api.sendgrid.com/v3/mail/send`) **30 days before** a certificate expires, **7 days before**, and **on the expiry day**.

Each reminder is sent once. The `notified_at` field prevents duplicates when the job runs again.

**How the key is protected:**
- The API key is a secret. It lives in **AWS Secrets Manager** (`ett/sendgrid`), created by `infra/floci/init.py` and never overwritten. S2 reads it at run time through its own IAM role. S1 and S3 have no permission to read it.
- The key is never written to the code, the repository, a log line, an error message or a response.
- Without a real key (real keys start with `SG.`), the job logs "email skipped" instead of failing. This is how the local stack runs, because the real key must never be committed.
- The secret scan (`scripts/secret_review.js`) would flag a SendGrid key committed by mistake.

**[EVIDENCE NEEDED: the run-check JSON answer, e.g. `{ "flagsRaised": .., "flagsResolved": .., "remindersSent": .., "remindersSkipped": .. }`, and the matching "email skipped" log line, from a real run.]**
