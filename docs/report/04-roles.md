# 4. Roles and permissions

Roles come **only** from the signed Cognito token (`cognito:groups` = Employee or Manager). The Service identity is recognised by its own app client id. Every rule below is enforced in the **backend** on every request. Hiding a button in the page is never relied on. A missing or invalid token gets 401, the wrong role or owner gets 403, and both are logged.

| Action | Not signed in | Employee | Manager | Service (daily jobs) | Where it is enforced |
|---|---|---|---|---|---|
| See own profile, own assignments | No | Own | Own | - | S1: identity from the token, never from the URL or body |
| Look up another employee | No | No (403) | Own team only | Yes | S1 `access.js` |
| List teams, team members, team assignments | No | No | Own teams only | All | S1, plus a team check in S2 and S3 through S1 `GET /api/teams` |
| Create a training / edit it | No | No | Create: yes / Edit: only the creator | - | S1 |
| Assign a training | No | No | Own team only | - | S1 |
| Mark a training completed | No | Own only | Own only (never for someone else) | - | S1 |
| Upload a certificate | No | For themselves | For themselves | - | S2: owner id from the token |
| View / download a certificate | No | Own | Own team | - | S2 ownership check; 5-minute pre-signed URL |
| Edit certificate dates | No | Own, while Pending | - | - | S2 |
| Verify / reject a certificate | No | No | Own team, **never their own** | - | S2 |
| Delete a certificate | No | Own, while Pending | Own team (soft delete) | - | S2, written to the audit log |
| Team compliance data | No | No | Own team | Yes | S2 |
| Dashboard, trend, attention list | No | No (403) | Own team only | - | S3: Manager role **and** team ownership through S1 |
| Reports, CSV export, report history | No | No (403) | Own team only | - | S3 (the history only lists and deletes runs of the caller's teams) |
| Daily validity check / daily snapshot | No | No (403) | No (403) | Yes | S2, S3: Service token only |

The database adds a second layer: each service connects with its own role and cannot read another service's tables (section 3).
