# 9. GitHub repository

**Repository:** https://github.com/karikasaad/Employee-training-tracker-team-28

How we worked:
- Each member worked on a fork, one branch per feature (for example `yahia/s3-dashboard-endpoints`, `kerolus/s1-assignments`, `karim/s2-upload`), and opened a pull request into `main`.
- PRs were reviewed in a circle (Kerolus reviews Karim, Karim reviews Yahia, Yahia reviews Kerolus) and merged with "Rebase and merge", so every commit keeps its author.
- `docs/API_CONTRACT.md` was merged first, so the services could be built in parallel against the same contract.

| Folder | Owner | Contents |
|---|---|---|
| `services/employee-training` | Kerolus | S1 |
| `services/certificate-compliance` | Karim | S2 |
| `services/dashboard-reports` | Yahia | S3 |
| `services/common` | Kerolus (logging shipper: Yahia) | auth, db guard, logging, errors |
| `frontend/common`, `frontend/s3` | Yahia | shared sign-in, API helper, nav; S3 pages |
| `frontend/s1`, `frontend/s2` | Kerolus, Karim | their pages |
| `infra/` | Karim (db: Kerolus) | Docker, nginx, Floci init, IAM, scheduler, schema and seed |
| `tests/security`, `tests/newman` | Yahia | security suite, end-to-end tests |
| `docs/` | everyone | contract, ER diagram, threat model, limitations, evidence, this report |

**[EVIDENCE NEEDED: a screenshot of the closed pull requests list, and of Insights → Contributors.]**
