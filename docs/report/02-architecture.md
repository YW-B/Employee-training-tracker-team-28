# 2. Architecture

**[EVIDENCE NEEDED: Figure 1, the architecture diagram approved by the TA (export it from Miro as a PNG and insert it here).]**

*Figure 1: Layered architecture of the Employee Training Tracker on AWS. Solid arrows are HTTPS/REST calls and data operations. Dashed arrows are sign-in, the scheduled jobs and IAM-role access to the shared services.*

## Layers and how they communicate

| Layer | What it does | AWS design | How it runs in our local simulation |
|---|---|---|---|
| **Frontend** | Presentation only: HTML, CSS and vanilla JavaScript pages grouped by service (S1: my trainings, team trainings; S2: my certificates, team certificates; S3: dashboard, reports). It holds no business rules and no secrets. Signs in with Cognito, then calls the API with the access token. | S3 static-website bucket behind CloudFront (HTTPS, ACM certificate) | Static files served by **nginx** over HTTPS (self-signed certificate), with a strict Content-Security-Policy |
| **Application / API** | Business logic and access control. Three Node.js + Express services, one per owner. Every service checks the JWT, the role and ownership or team before touching data. | AWS Elastic Beanstalk, one environment per service, each with its own IAM role | Three Docker containers. nginx routes by path prefix: `/api/employees`, `/api/teams`, `/api/trainings` and `/api/assignments` go to **S1**; `/api/certificates` and `/api/compliance` go to **S2**; `/api/dashboard` and `/api/reports` go to **S3** |
| **Data** | Persistent data that survives restarts. PostgreSQL holds each service's own tables. A private bucket holds the certificate files. | Amazon RDS for PostgreSQL (KMS encrypted, private); private S3 bucket (Block Public Access, versioning, KMS) | PostgreSQL container with one database role per service (`svc_s1`, `svc_s2`, `svc_s3`); Floci S3 bucket created by `infra/floci/init.py` |
| **Identity, secrets, operations** (used by every layer) | Sign-in and roles, secrets (including the S1 and S3 database logins), logs and alarms, the daily jobs | Cognito (MFA for managers, 15-minute access tokens), Secrets Manager, CloudWatch Logs and Alarms, EventBridge Scheduler | The same services emulated by **Floci** at one endpoint (`AWS_ENDPOINT_URL`), plus a fallback cron container (`infra/scheduler`) for the daily jobs |
| **External API** | E-mail reminders | SendGrid Email API over HTTPS, key in Secrets Manager | Same code path. Locally the key is a placeholder, so e-mails are logged as skipped. |

## Service-to-service communication

The services never read each other's tables. They call each other over REST with the caller's own Bearer token, so each service applies its own access checks:
- **S2** asks S1 for team ownership (`GET /api/teams`) and for the completed trainings of a team (`GET /api/teams/{id}/assignments`), to work out Missing and Expired flags.
- **S3** asks S1 for the team's employees and assignments, and S2 for the team's certificates and flags (`GET /api/compliance/teams/{id}`). It then applies the compliance rules itself.
- The **daily jobs** call S2 `POST /api/compliance/run-check` and S3 `POST /api/dashboard/run-snapshot` with a Service token.

Calls between services have a 3-second timeout. If a dependency fails, the caller returns 502 or 503 with an error body, and never shows half the numbers.
