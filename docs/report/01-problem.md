# 1. Problem definition

## Problem

Many organisations still track mandatory training and professional certificates in spreadsheets, shared folders and e-mail. It is hard to see who has finished the required courses, and certificates expire quietly without the manager noticing in time. This creates real risks: failed audits, fines, staff working with expired safety certificates, and copies of personal documents left in unsafe places.

The **Employee Training Tracker** is a cloud application that does four things:
- assigns required trainings with due dates, and works out on its own when one is overdue;
- lets employees upload their certificates, which are stored privately and checked for validity every day;
- reminds people before a certificate expires;
- gives each manager a live view of which team members are compliant, and why the others are not.

## Users and roles

| Role | Who | What they need |
|---|---|---|
| **Employee** | Staff who must complete trainings and hold valid certificates | See their own trainings and status, mark a training completed, upload a certificate securely, get a reminder before a certificate expires |
| **Manager** | Team leads responsible for their team's compliance | Assign trainings to their own team, verify or reject certificates, see the compliance dashboard and the attention list, build team or category reports and export them to CSV |

A third identity, the **Service** client, is used only by the two daily jobs (the validity check and the snapshot). No person signs in as Service.

## Benefit

Today compliance is checked by hand, often only when an audit is due. With the tracker:
- certificates are stored once, in a private bucket;
- validity is checked automatically every day, and reminders go out before expiry;
- managers see their team's compliance rate and the reasons for each non-compliant employee in one dashboard, instead of chasing documents by e-mail.

## Scope

| In scope | Out of scope (and why) |
|---|---|
| Trainings, assignments with due dates, Overdue calculated on read, completion and automatic renewal, team views (S1) | Hosting the training courses themselves (videos, quizzes). The project tracks compliance; it is not a learning platform. |
| Certificate upload with file checks, issue and expiry dates, manager verification, validity and Missing/Expired flags, reminders through SendGrid (S2) | Checking a certificate's authenticity with the issuing body. Most issuers have no public API, so a manager verifies it instead. |
| Compliance rules, dashboard, attention list, daily snapshot and trend, reports by team and category, CSV export, report history (S3) | HR or payroll integration, and screens for adding employees or teams. Employees and teams come from the seed script. |
| Employee and Manager roles, logging and monitoring, security tests | Native mobile apps. The web pages are responsive and work on phones. |

## Business rules (shared by all three services)

| Rule | Definition | Owner |
|---|---|---|
| Overdue | `dueDate` is before today (UTC) **and** the training is not completed. Due **today** is not overdue. Calculated every time the data is read, never stored. | S1 |
| Renewal | Completing a training with a validity period creates the next assignment, due on the completion date plus the validity months. | S1 |
| Certificate validity | Valid: more than 30 days left. Expiring soon: 0–30 days. Expired: the date has passed. Only **Verified** certificates count. | S2 |
| Missing / Expired flag | A completed training that requires a certificate needs a Verified, unexpired certificate. If there is none, the flag is **Missing**. If the newest Verified certificate has expired, the flag is **Expired**. | S2 |
| Compliant | No Overdue assignment **and** no open Missing or Expired flag. Otherwise Non-compliant, with reasons OverdueTraining, CertificateMissing and CertificateExpired. "Expiring soon" stays Compliant, but the employee goes on the attention list. | S3 |
| Compliance rate | compliant ÷ all employees × 100, rounded to 1 decimal, for the whole team or one category. An empty team gives 0. | S3 |
