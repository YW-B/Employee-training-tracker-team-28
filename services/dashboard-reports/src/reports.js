// EN: Report endpoints (docs/API_CONTRACT.md 6.6-6.9). Manager only.
//     A report = one row per assignment of the team (optionally one training category), with the
//     training status, the certificate status and the employee's compliance. Every report is recorded in
//     S3's own report_runs table, which gives the report history.
// Franco: Endpoints el reports. Lel Manager bas.
//     El report = satr le kol assignment fel team (aw category wa7da bas), feeh status el training w status
//     el certificate w compliance el mowazzaf. Kol report beyetsaggel fe gadwal report_runs bta3 S3, w da
//     beyedeena tareekh el reports.
'use strict';
const express = require('express');
const { badRequest, forbidden, notFound } = require('../../common/errors');
const { evaluateTeam, isOverdue, todayUtc } = require('./compliance');
const { createTeamData, UUID } = require('./teamData');
const { toCsv } = require('./csv');

const CSV_COLUMNS = [
  ['Employee', 'name'], ['Training', 'trainingName'], ['Category', 'category'], ['Assignment status', 'assignmentStatus'],
  ['Due date', 'dueDate'], ['Certificate status', 'certificateStatus'], ['Compliance', 'compliance'],
];

// EN: ?category= is optional; at most 50 characters (same limit as the database column).
// Franco: ?category= ekhteyari; 50 7arf bel kteer (nafs limit el column fel database).
function readCategory(req) {
  const { category } = req.query;
  if (category === undefined || category === '') return null;
  if (typeof category !== 'string' || category.length > 50) {
    throw badRequest('category must be text of at most 50 characters', [{ field: 'category', issue: 'too long' }]);
  }
  return category;
}

// EN: assignment status, calculated on read like S1 does: Completed, Overdue or Assigned.
// Franco: status el assignment, mat7soob wa2t el 2eraya zay S1: Completed aw Overdue aw Assigned.
function assignmentStatus(a, day) {
  if (a.completedAt) return 'Completed';
  return isOverdue(a, day) ? 'Overdue' : 'Assigned';
}

// EN: certificate status for one assignment, from the flags S2 gave us:
//     Not required -> the training needs no certificate; Missing / Expired / Expiring soon -> from the flags;
//     Valid -> completed and no flag (S2 found a Verified, unexpired certificate);
//     Not yet required -> the training is not completed yet, so no certificate is expected yet.
// Franco: status el certificate le assignment wa7ed, men el flags elly S2 edahalna:
//     Not required -> el training mesh me7taga certificate; Missing / Expired / Expiring soon -> men el flags;
//     Valid -> mekhallas w mafeesh flag; Not yet required -> el training lessa mat-khallasetsh.
function certificateStatus(a, flags) {
  if (a.requiresCertificate === false) return 'Not required';
  const mine = flags.filter((f) => f.employeeId === a.employeeId && f.trainingId === a.trainingId);
  if (mine.some((f) => f.type === 'Missing')) return 'Missing';
  if (mine.some((f) => f.type === 'Expired')) return 'Expired';
  if (mine.some((f) => f.type === 'ExpiringSoon')) return 'Expiring soon';
  return a.completedAt ? 'Valid' : 'Not yet required';
}

function createReportsRouter({ auth, upstream, store, today = () => todayUtc() }) {
  const router = express.Router();
  const { checkTeamAccess, evaluate, ctxOf } = createTeamData({ upstream, today });

  // EN: Security check 1: valid token AND role Manager, for every /api/reports route.
  // Franco: Check amn 1: token sa7 W role Manager, le kol routes /api/reports.
  router.use('/api/reports', auth.requireAuth(['Manager']));

  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

  // EN: build the report rows and record the run in report_runs (who, which team, which category, how many rows).
  //     generatedBy is the caller's employeeId from S1 GET /api/employees/me, never from the request.
  // Franco: nebny rows el report w nsaggel el run fe report_runs (meen, anhy team, anhy category, kam satr).
  //     generatedBy howa employeeId el caller men S1 GET /api/employees/me, 3omro ma beyegi men el request.
  async function buildReport(req) {
    const category = readCategory(req); // EN: 400 before any other call / Franco: 400 abl ay call tany
    const { team, ctx } = await checkTeamAccess(req);
    const [{ employees, assignments, flags, day }, me] = await Promise.all([evaluate(team.id, ctx), upstream.getMe(ctx)]);

    const inScope = assignments.filter((a) => category === null || a.category === category);
    const compliance = new Map(
      evaluateTeam(employees, assignments, flags, day, category).map((r) => [r.employeeId, r.status]),
    );
    const names = new Map(employees.map((e) => [e.id, e.name]));
    const rows = inScope.map((a) => ({
      employeeId: a.employeeId,
      name: names.get(a.employeeId) || a.employeeName || '',
      trainingName: a.trainingName || '',
      category: a.category,
      assignmentStatus: assignmentStatus(a, day),
      dueDate: a.dueDate,
      certificateStatus: certificateStatus(a, flags),
      compliance: compliance.get(a.employeeId) || 'Compliant',
    }));

    const run = await store.addReportRun(team.id, category, me.id, rows.length);
    return { reportRunId: run.id, teamId: team.id, category, generatedAt: run.generatedAt, rows };
  }

  // EN: 6.6 the report as JSON.
  // Franco: 6.6 el report ka JSON.
  router.get('/api/reports/teams/:teamId', wrap(async (req, res) => {
    res.json(await buildReport(req));
  }));

  // EN: 6.7 the same rows as a CSV download (with the CSV injection guard from csv.js).
  // Franco: 6.7 nafs el rows ka CSV lel download (bel 7emaya men CSV injection men csv.js).
  router.get('/api/reports/teams/:teamId/export', wrap(async (req, res) => {
    const report = await buildReport(req);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="team-report.csv"');
    res.send(toCsv(CSV_COLUMNS, report.rows));
  }));

  // EN: 6.8 report history, only for the teams this manager manages (list from S1).
  // Franco: 6.8 tareekh el reports, lel teams elly el manager da modeerha bas (el list men S1).
  router.get('/api/reports/history', wrap(async (req, res) => {
    const teams = await upstream.getTeams(ctxOf(req));
    const teamIds = (Array.isArray(teams) ? teams : []).map((t) => t.id);
    res.json(teamIds.length ? await store.listReportRuns(teamIds) : []);
  }));

  // EN: 6.9 delete one history entry: 400 bad id, 404 unknown, 403 if it belongs to another manager's team.
  // Franco: 6.9 nemsa7 satr men el tareekh: 400 id ghalat, 404 mesh mawgood, 403 law beta3 team manager tany.
  router.delete('/api/reports/history/:id', wrap(async (req, res) => {
    const { id } = req.params;
    if (!UUID.test(id)) throw badRequest('id must be a UUID', [{ field: 'id', issue: 'not a UUID' }]);
    const run = await store.getReportRun(id);
    if (!run) throw notFound('Report not found');
    const teams = await upstream.getTeams(ctxOf(req));
    if (!(Array.isArray(teams) ? teams : []).some((t) => t.id === run.teamId)) {
      throw forbidden('This report belongs to another team');
    }
    await store.deleteReportRun(id);
    res.status(204).end();
  }));

  return router;
}

module.exports = { createReportsRouter, certificateStatus, assignmentStatus };
