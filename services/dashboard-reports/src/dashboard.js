// EN: Dashboard endpoints (docs/API_CONTRACT.md 6.1-6.5). 6.1-6.4 are Manager only; 6.5 (run-snapshot) is
//     for the daily job only (Service token).
//     Flow for every request: check the token (auth module) -> check the caller manages {teamId} (through S1)
//     -> get employees + assignments (S1) and certificates/flags (S2) -> apply the compliance rules.
// Franco: Endpoints el dashboard. 6.1-6.4 lel Manager bas; 6.5 (run-snapshot) lel job el yomy bas (Service token).
//     El tare2a le kol request: check el token -> check en el caller howa manager el {teamId} (3an taree2 S1)
//     -> nageeb el employees w el assignments (S1) w el certificates/flags (S2) -> nesta3mel rules el compliance.
'use strict';
const express = require('express');
const { badRequest, forbidden } = require('../../common/errors');
const { toDay } = require('./compliance');
const {
  evaluateTeam, complianceRate, attentionOrder, flagsFromContract, isOverdue, REASON_ORDER, todayUtc,
} = require('./compliance');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// EN: the public row shape (ComplianceRow in the contract).
// Franco: shakl el row elly beytla3 (ComplianceRow fel contract).
function toRow(r) {
  return {
    employeeId: r.employeeId,
    name: r.name,
    status: r.status,
    reasons: r.reasons,
    expiringSoon: r.expiringSoon,
    daysOverdueMax: r.daysOverdueMax,
    daysExpiredMax: r.daysExpiredMax,
    soonestExpiry: r.soonestExpiry,
  };
}

// EN: "YYYY-MM-DD" minus n days, in UTC.
// Franco: tareekh "YYYY-MM-DD" na2es n ayam, bel UTC.
function minusDays(day, n) {
  return new Date((toDay(day) - n) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function createDashboardRouter({ auth, upstream, store, today = () => todayUtc() }) {
  const router = express.Router();

  // EN: Security check 1: valid Cognito token AND the right role (401 / 403 from the auth module).
  //     Manager routes: an Employee or a Service token gets 403. The snapshot job: only a Service token.
  // Franco: Check amn 1: token Cognito sa7 W el role el sa7. Routes el Manager: Employee aw Service token
  //     yakhod 403. Job el snapshot: Service token bas.
  const managerOnly = auth.requireAuth(['Manager']);
  const serviceOnly = auth.requireAuth(['Service']);

  // EN: Security check 2 (ownership): S1's GET /api/teams returns ONLY the teams this manager manages.
  //     If {teamId} is not in the list we ask S1 for the team's employees: S1 answers 404 (unknown team)
  //     or 403 (another manager's team), and we pass that on. Then load all the data in parallel.
  // Franco: Check amn 2 (el ownership): GET /api/teams men S1 beyrga3 el teams elly el manager da
  //     modeerha BAS. Law {teamId} mesh fel list bnes2al S1: yerod 404 (team mesh mawgood) aw 403
  //     (team manager tany) w bnwasselha. Ba3den bnegeeb kol el data fe nafs el wa2t.
  async function checkTeamAccess(req) {
    const { teamId } = req.params;
    if (!UUID.test(teamId)) throw badRequest('teamId must be a UUID', [{ field: 'teamId', issue: 'not a UUID' }]);
    const ctx = { token: req.headers.authorization.slice('Bearer '.length), requestId: req.requestId };

    const teams = await upstream.getTeams(ctx);
    const team = Array.isArray(teams) ? teams.find((t) => t.id === teamId) : undefined;
    if (!team) {
      await upstream.getTeamEmployees(teamId, ctx); // EN: throws 404 or 403 / Franco: beyrmy 404 aw 403
      throw forbidden('You are not the manager of this team');
    }
    return { team, ctx };
  }

  // EN: get the team's data from S1 and S2 (in parallel) and apply the compliance rules.
  // Franco: negeeb data el team men S1 w S2 (fe nafs el wa2t) w nesta3mel rules el compliance.
  async function evaluate(teamId, ctx) {
    const [employees, assignments, compliance] = await Promise.all([
      upstream.getTeamEmployees(teamId, ctx),
      upstream.getTeamAssignments(teamId, ctx),
      upstream.getTeamCompliance(teamId, ctx),
    ]);
    const day = today();
    const flags = flagsFromContract(compliance, assignments, day);
    const rows = evaluateTeam(employees, assignments, flags, day);
    return { assignments, flags, rows, day };
  }

  async function loadTeam(req) {
    const { team, ctx } = await checkTeamAccess(req);
    return { team, ...(await evaluate(team.id, ctx)) };
  }

  // EN: small wrapper so an async error goes to the error handler (Express 4 does not do it alone).
  // Franco: wrapper so8ayyar 3ashan el error el async yero7 lel error handler (Express 4 mabey3melhash lewa7do).
  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

  // EN: 6.1 summary: compliance rate, counts and reasons for the team.
  // Franco: 6.1 el molakhas: nesbet el compliance w el a3dad w el asbab lel team.
  router.get('/api/dashboard/teams/:teamId/summary', managerOnly, wrap(async (req, res) => {
    const { team, assignments, flags, rows, day } = await loadTeam(req);
    const nonCompliantByReason = Object.fromEntries(
      REASON_ORDER.map((reason) => [reason, rows.filter((r) => r.reasons.includes(reason)).length]),
    );
    const compliantCount = rows.filter((r) => r.status === 'Compliant').length;
    res.json({
      teamId: team.id,
      teamName: team.name,
      employeeCount: rows.length,
      compliantCount,
      nonCompliantCount: rows.length - compliantCount,
      complianceRate: complianceRate(rows),
      nonCompliantByReason,
      overdueTrainings: assignments.filter((a) => isOverdue(a, day)).length,
      expiringWithin30Days: flags.filter((f) => f.type === 'ExpiringSoon').length,
      generatedAt: new Date().toISOString(),
    });
  }));

  // EN: 6.2 employees with status and reasons; optional ?status=compliant|non-compliant (else 400).
  //     The query is checked BEFORE calling other services.
  // Franco: 6.2 el mowazzafeen bel status w el asbab; ?status ekhteyari (ghair kda 400).
  //     El query bet-et-check ABL ma nekallem el services el tanya.
  router.get('/api/dashboard/teams/:teamId/employees', managerOnly, wrap(async (req, res) => {
    const { status } = req.query;
    const allowed = { compliant: 'Compliant', 'non-compliant': 'Non-compliant' };
    if (status !== undefined && !Object.hasOwn(allowed, String(status).toLowerCase())) {
      throw badRequest('status must be compliant or non-compliant', [{ field: 'status', issue: 'invalid value' }]);
    }
    const { rows } = await loadTeam(req);
    const wanted = status === undefined ? null : allowed[String(status).toLowerCase()];
    res.json(rows.filter((r) => wanted === null || r.status === wanted).map(toRow));
  }));

  // EN: 6.3 attention list: non-compliant first (longest overdue/expired), then expiring soon (soonest).
  // Franco: 6.3 el attention list: el non-compliant el awel, ba3den elly hayekhlas 2orayyeb.
  router.get('/api/dashboard/teams/:teamId/attention', managerOnly, wrap(async (req, res) => {
    const { rows } = await loadTeam(req);
    res.json(attentionOrder(rows).map(toRow));
  }));

  // EN: 6.4 trend: compliance rate per day for the last ?days days (1-90, default 30), from S3's own
  //     compliance_snapshots table. Days with no snapshot simply have no point.
  // Franco: 6.4 el trend: nesbet el compliance le kol yom fe a5er ?days yom (1-90, el default 30), men
  //     gadwal compliance_snapshots bta3 S3. El yom elly malosh snapshot malosh no2ta.
  router.get('/api/dashboard/teams/:teamId/trend', managerOnly, wrap(async (req, res) => {
    const raw = req.query.days === undefined ? '30' : String(req.query.days);
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 90) {
      throw badRequest('days must be a whole number from 1 to 90', [{ field: 'days', issue: 'out of range' }]);
    }
    const days = Number(raw);
    const { team } = await checkTeamAccess(req);
    const day = today();
    const rows = await store.trend(team.id, minusDays(day, days - 1), day);
    res.json({
      teamId: team.id,
      days,
      points: rows.map((r) => ({
        date: r.date,
        complianceRate: r.employee_count ? Math.round((r.compliant_count / r.employee_count) * 1000) / 10 : 0,
        employeeCount: r.employee_count,
      })),
    });
  }));

  // EN: 6.5 the daily snapshot job (Service token only). It evaluates EVERY team and saves one row per
  //     employee for today. All teams are read FIRST; if S1 or S2 fails nothing is written (no half day).
  //     Running it twice on the same day keeps one row per employee (upsert).
  // Franco: 6.5 job el snapshot el yomy (Service token bas). Bey-evaluate KOL el teams w beysayyev satr le
  //     kol mowazzaf lel naharda. Bne2ra kol el teams EL AWEL; law S1 aw S2 fashal mabnektebsh 7aga.
  //     Law eshtaghal marteen fe nafs el yom yefdal satr wa7ed le kol mowazzaf (upsert).
  router.post('/api/dashboard/run-snapshot', serviceOnly, wrap(async (req, res) => {
    const ctx = { token: req.headers.authorization.slice('Bearer '.length), requestId: req.requestId };
    const teams = await upstream.getTeams(ctx); // EN: a Service token gets ALL teams / Franco: el Service yakhod kol el teams
    const day = today();
    const toSave = [];
    for (const team of teams) {
      const { assignments, flags, rows } = await evaluate(team.id, ctx);
      for (const r of rows) {
        toSave.push({
          teamId: team.id,
          employeeId: r.employeeId,
          status: r.status,
          reasons: r.reasons,
          overdueCount: assignments.filter((a) => a.employeeId === r.employeeId && isOverdue(a, day)).length,
          expiringCount: flags.filter((f) => f.employeeId === r.employeeId && f.type === 'ExpiringSoon').length,
        });
      }
    }
    const rowsUpserted = await store.upsertSnapshots(day, toSave);
    res.json({ snapshotDate: day, teamsProcessed: teams.length, rowsUpserted });
  }));

  return router;
}

module.exports = { createDashboardRouter, UUID };
