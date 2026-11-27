# 16. Limitations

The detailed list, with real results from the Floci runs, is in `docs/LIMITATIONS.md` and `docs/FLOCI_SPIKE.md`. In short:

## Simulation (Floci instead of real AWS)

- **No public deployment.** Everything runs on Docker Desktop with Floci, behind a self-signed certificate. The AWS design in section 6 is not deployed.
- **IAM is not enforced** by Floci by default. The least-privilege policies in `infra/iam/` are written and attached, but a forbidden call would not be refused locally. The database roles *are* enforced (Postgres is real).
- **S3:** Floci serves objects without a signature, and pre-signed URLs do not expire. Our code still issues 5-minute signed links, and the website never exposes the bucket. On AWS, Block Public Access refuses unsigned reads.
- **Bucket versioning and encryption** are set by `init.py` but cannot be read back from Floci.
- **CloudWatch:** logs, metric filters and the alarm work, but the alarm is never evaluated, so it stays OK. There are no Logs Insights queries; we read the logs with FilterLogEvents instead.
- **Cognito:** see `docs/FLOCI_COGNITO_NOTES.md` for what Floci supports (groups, token lifetime, MFA). JWT expiry is enforced by our own code either way.
- **EventBridge Scheduler** HTTP targets: a fallback cron container runs the daily jobs locally.
- **SendGrid:** no real key is stored locally, so reminders are logged as "email skipped".

## Product limits (chosen scope)

- Employees and teams come from the seed script. There are no admin screens to add people.
- Certificates are verified by a manager, not checked with the issuer.
- A stolen access token works until it expires (at most 15 minutes). Refresh tokens are revoked on sign-out.
- Denial of service is out of scope beyond timeouts and size limits.

## What we would do next on real AWS

Deploy to Elastic Beanstalk, RDS and S3/CloudFront with GitHub Actions and OIDC; turn on Block Public Access and IAM enforcement; send the alarm to SNS; use Logs Insights and a dashboard; store the real SendGrid key in Secrets Manager.
