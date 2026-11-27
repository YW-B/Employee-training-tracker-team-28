# 3. Services, APIs and data

All three services use REST and JSON over HTTPS behind nginx, with a Cognito JWT in the `Authorization: Bearer` header. Errors always use one shape: `{ "error": { "code", "message", "requestId" } }`. The full contract, with every request and response body, is in `docs/API_CONTRACT.md`.

## Service 1: Employee & Training (Kerolus, port 5001)

**Business logic:** Overdue is calculated on every read from `dueDate` and `completedAt`, never stored. Completing a training with a validity period creates the renewal assignment in the same transaction. A duplicate open assignment is refused with 409. Due dates in the past are refused. A manager can only assign to their own team.

| Method and path | Who may call it | Validation | Status codes |
|---|---|---|---|
| GET `/api/employees/me` | Employee, Manager | identity from the token | 200, 401, 404 |
| GET `/api/employees/{id}` | the employee, their manager, Service | uuid | 200, 400, 401, 403, 404 |
| GET `/api/teams` | Manager (own teams only), Service (all) | - | 200, 401, 403 |
| GET `/api/teams/{teamId}/employees` | manager of the team, Service | uuid | 200, 400, 401, 403, 404 |
| GET `/api/teams/{teamId}/assignments?status=` | manager of the team, Service | uuid, status value | 200, 400, 401, 403, 404 |
| GET `/api/teams/{teamId}/summary` | manager of the team | uuid | 200, 400, 401, 403, 404 |
| POST `/api/trainings` | Manager | name 1–150 (unique), category 1–50, boolean, validity 1–120 or null | 201, 400, 401, 403, 409 |
| PUT `/api/trainings/{id}` | the manager who created it | same as create | 200, 400, 401, 403, 404, 409 |
| GET `/api/trainings?category=`, GET `/api/trainings/{id}` | Employee, Manager (Service for one) | category 1–50, uuid | 200, 400, 401, 404 |
| POST `/api/assignments` | Manager, own team only | exactly one of employeeId or teamId, uuid, dueDate today or later | 201, 400, 401, 403, 404, 409 |
| GET `/api/assignments/me` | Employee, Manager | identity from the token | 200, 401 |
| PATCH `/api/assignments/{id}/complete` | the assignment's own employee only | uuid | 200, 400, 401, 403, 404, 409 |

## Service 2: Certificate & Compliance (Karim, port 5002)

**Business logic:**
- File type is checked by **magic bytes** (PDF, JPEG, PNG only). The limit is 5 MB, files get a random storage key, and a SHA-256 hash is stored.
- Only **Verified** certificates count. Validity is Valid, Expiring soon or Expired.
- Missing and Expired flags come from S1's completed trainings.
- A manager can never verify their own certificate.
- Every change goes to an append-only audit log.
- The daily check raises and resolves flags, and sends SendGrid reminders.

| Method and path | Who may call it | Validation | Status codes |
|---|---|---|---|
| POST `/api/certificates` (multipart) | Employee, Manager (own certificate; owner from the token) | magic bytes, ≤ 5 MB, dates valid and issue ≤ expiry, training exists | 201, 400, 401, 404, 413, 415 |
| GET `/api/certificates/me` | Employee, Manager | - | 200, 401 |
| GET `/api/certificates?teamId=&reviewStatus=` | manager of the team | uuid, status value | 200, 400, 401, 403, 404 |
| GET `/api/certificates/{id}` | owner, owner's manager | uuid | 200, 400, 401, 403, 404 |
| PUT `/api/certificates/{id}` | owner, only while Pending | dates, text lengths | 200, 400, 401, 403, 404, 409 |
| GET `/api/certificates/{id}/download` | owner, owner's manager | uuid; returns a **5-minute pre-signed URL** | 200, 400, 401, 403, 404 |
| PATCH `/api/certificates/{id}/verify` | manager of the owner's team (never their own) | decision verify/reject, reason required to reject | 200, 400, 401, 403, 404, 409 |
| DELETE `/api/certificates/{id}` | owner while Pending, owner's manager (soft delete) | uuid | 204, 400, 401, 403, 404 |
| GET `/api/compliance/teams/{teamId}` | manager of the team, Service | uuid | 200, 400, 401, 403, 404, 502, 503 |
| POST `/api/compliance/run-check` | Service only (daily job) | - | 200, 401, 403 |

## Service 3: Manager Dashboard & Reports (Yahia, port 5003)

**Business logic:**
- S3 owns the **definition of Compliant**. It combines S1's assignments with S2's flags and Verified certificates, then decides the status and reasons for each employee.
- It computes the compliance rate, overall or per category, and ranks the attention list.
- It stores its own daily snapshots for the trend and its own report history.
- It also builds the CSV export, escaping any cell that starts with `=`, `+`, `-` or `@`.
- Every route checks the Manager role, **and** team ownership through S1.

| Method and path | Who may call it | Validation | Status codes |
|---|---|---|---|
| GET `/api/dashboard/teams/{teamId}/summary` | manager of the team | uuid | 200, 400, 401, 403, 404, 502, 503 |
| GET `/api/dashboard/teams/{teamId}/employees?status=` | manager of the team | uuid; status compliant or non-compliant (checked before any other call) | 200, 400, 401, 403, 404, 502, 503 |
| GET `/api/dashboard/teams/{teamId}/attention` | manager of the team | uuid | 200, 400, 401, 403, 404, 502, 503 |
| GET `/api/dashboard/teams/{teamId}/trend?days=` | manager of the team | days a whole number 1–90 (default 30) | 200, 400, 401, 403, 404 |
| POST `/api/dashboard/run-snapshot` | Service only (daily job) | - ; one row per employee per day (upsert), all-or-nothing transaction | 200, 401, 403, 502, 503 |
| GET `/api/reports/teams/{teamId}?category=` | manager of the team | category ≤ 50 characters | 200, 400, 401, 403, 404, 502, 503 |
| GET `/api/reports/teams/{teamId}/export?category=` | manager of the team | same; CSV with formula-injection protection | 200, 400, 401, 403, 404 |
| GET `/api/reports/history` | Manager (own teams' runs only) | - | 200, 401, 403 |
| DELETE `/api/reports/history/{id}` | Manager, only for a run of their own team | uuid | 204, 400, 401, 403, 404 |

## Data design

**[EVIDENCE NEEDED: Figure 2, the ER diagram. Export the Mermaid diagram in `docs/ER_DIAGRAM.md` as a PNG at https://mermaid.live and insert it here.]**

One PostgreSQL database, with tables owned by one service each. Real foreign keys exist only inside a service's own tables. Links across services (for example `certificates.employee_id`) are checked through the owning service's API, not by the database.

| Service | Tables | Main operations | DB role (least privilege) |
|---|---|---|---|
| S1 | `teams`, `employees`, `trainings`, `assignments` | create/read/update trainings; create assignments; complete + insert renewal in one transaction; team and status queries | `svc_s1`: only its own tables |
| S2 | `certificates`, `compliance_flags`, `audit_log` | insert certificate + audit row; update dates while Pending; verify/reject; soft delete; raise/resolve flags; append-only audit | `svc_s2`: only its own tables; audit log insert-only |
| S3 | `compliance_snapshots`, `report_runs` | upsert one snapshot row per employee per day (`UNIQUE (employee_id, snapshot_date)`); trend aggregate per day; insert/list/delete report runs | `svc_s3`: SELECT/INSERT/UPDATE snapshots, SELECT/INSERT/DELETE report runs, nothing else |

Every query goes through `services/common/db.js`, which refuses SQL that has quote characters, stacked statements or a wrong number of `$n` parameters. Values can only travel as parameters. `infra/db/checks.sql` proves the role limits, for example: "svc_s3 reads its snapshots but is denied S1 tables".
