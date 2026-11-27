# 6. Deployment approach

## Target design on AWS: PaaS

| Part | AWS service | Why |
|---|---|---|
| Frontend | S3 static website + CloudFront (HTTPS, ACM certificate) | Static files need no server. HTTPS and caching come built in. Free tier. |
| Three services | AWS Elastic Beanstalk (Node.js platform), one environment per service | PaaS: AWS patches the operating system and runtime. Each owner deploys their own service. Each environment has its own IAM role. |
| Data | Amazon RDS for PostgreSQL (private, KMS) and a private S3 bucket (KMS, versioning, Block Public Access) | Managed backups and encryption. Data survives redeployments. |
| Identity, secrets, monitoring, jobs | Cognito, Secrets Manager, CloudWatch, EventBridge Scheduler | Managed and pay-per-use, inside the free tier at our scale |
| CI/CD | GitHub Actions (tests on every pull request, secret scan) | Deploys to AWS through OpenID Connect, with no stored access keys |

**Why PaaS fits:** the project is three small web services and a database. IaaS (EC2) would make the team responsible for patching servers. Serverless functions would split each service into many small parts and make the live discussion harder. PaaS keeps one deployable unit per owner, and leaves the infrastructure work to AWS.

**Trade-offs:**
- Elastic Beanstalk gives less control than containers on ECS/EKS, but it is much simpler.
- One shared RDS instance (with separate roles per service) is cheaper than three databases, but the services are less isolated.
- Cognito's hosted sign-in limits how much the login page can be styled.

## How it actually runs: simulated locally

We had no AWS account that needs no personal payment, so the AWS design runs on **Floci**, a local AWS emulator, with **Docker Compose** (`docker-compose.yml`):

| AWS piece | Local stand-in |
|---|---|
| CloudFront + S3 website, load balancing by path | **nginx** container on https://localhost:8443 (self-signed certificate, HTTP redirected to HTTPS, HSTS, CSP) |
| Elastic Beanstalk environments | three Node.js 20 containers (`s1`, `s2`, `s3`), each running as a non-root user |
| RDS PostgreSQL | `postgres:16` container with the per-service roles |
| S3, Secrets Manager, Cognito, CloudWatch, KMS, IAM, EventBridge | **Floci** at `AWS_ENDPOINT_URL=http://floci:4566`, set up by `infra/floci/init.py` and `infra/floci/cognito/cognito_init.js` |
| EventBridge Scheduler | a fallback cron container (`infra/scheduler`): 01:00 UTC S2 run-check, 01:30 UTC S3 run-snapshot |

The application code is the same for both: every AWS call takes its endpoint from `AWS_ENDPOINT_URL`. On real AWS that variable is left empty, and the normal AWS endpoints are used. The steps to start everything are in `docs/DEV_SETUP.md`: `python scripts/dev.py up`, then init and seed.

**Deployed URL:** **[EVIDENCE NEEDED: the TA's answer on what to submit here. If local is accepted: https://localhost:8443, with the demo video as proof. If a public URL is required: the deployed URL.]**

What Floci does not enforce, compared with real AWS, is listed in section 16.
