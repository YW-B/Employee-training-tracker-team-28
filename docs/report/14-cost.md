# 14. Cost and resources

## Resources

| Where | Resource | Size | Cost |
|---|---|---|---|
| Local (what we ran) | Docker Desktop: nginx, 3 Node services, Postgres, Floci, scheduler | one laptop | free |
| AWS design | Elastic Beanstalk: 3 environments | 1 small free-tier instance each (single instance, no load balancer) | free tier / education credits |
| AWS design | RDS PostgreSQL | 1 shared free-tier instance, 20 GB, separate roles per service | free tier |
| AWS design | S3 | 1 private certificates bucket + 1 static-site bucket | a few MB; free tier |
| AWS design | CloudFront + ACM certificate | 1 distribution | free tier; ACM certificates are free |
| AWS design | Cognito | 1 user pool, a handful of users | free tier |
| AWS design | Secrets Manager | 3 secrets | very low; can be replaced by SSM Parameter Store (free) if needed |
| AWS design | CloudWatch | 3 log groups (7-day retention), 1 metric filter per group, 1 alarm | free tier |
| AWS design | EventBridge Scheduler | 2 daily schedules | free tier |
| External | SendGrid | a few e-mails per day | free plan |

## How we avoid cost

- We use only the free tier or education credits, with an AWS Budgets alert at a very low amount.
- There is one small instance per service and one shared database, with no NAT gateway and no load balancer at this scale.
- Logs are kept for 7 days. Idle environments are stopped between demos, and every resource is deleted after the course.
- Developing and testing happen locally on Floci, so no AWS cost appears while building.

## Handling more load (with cost in mind)

- **More users:** each Elastic Beanstalk environment can auto-scale horizontally behind a load balancer, because the services are stateless (the JWT carries the identity and the data is in RDS and S3). Only the service under pressure scales. For example, S3 at report time.
- **Database:** add a read replica for the dashboard and report queries, or move to a larger instance class. The trend query reads S3's own pre-computed daily snapshots instead of recomputing history.
- **Files:** S3 scales automatically. Downloads go straight to S3 through pre-signed URLs, so the services don't carry file traffic.
- **Cost trade-off:** each of these steps adds cost, so we would turn them on only when monitoring shows the need (CloudWatch metrics per environment).
