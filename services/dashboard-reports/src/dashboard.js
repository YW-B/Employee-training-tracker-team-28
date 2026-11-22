// EN: Dashboard endpoints (docs/API_CONTRACT.md 6.1-6.3). Manager only.
//     Flow for every request: check the token (auth module) -> check the caller manages {teamId} (through S1)
//     -> get employees + assignments (S1) and certificates/flags (S2) -> apply the compliance rules.
// Franco: Endpoints el dashboard. Lel Manager bas.
//     El tare2a le kol request: check el token -> check en el caller howa manager el {teamId} (3an taree2 S1)
//     -> nageeb el employees w el assignments (S1) w el certificates/flags (S2) -> nesta3mel rules el compliance.
'use strict';
const express = require('express');
const { badRequest, forbidden } = require('../../common/errors');
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

function createDashboardRouter({ auth, upstream, today = () => todayUtc() }) {
  const router = express.Router();

  // EN: Security check 1: valid Cognito token AND role Manager (401 / 403 from the auth module).
  //     A Service token or an Employee gets 403.
  // Franco: Check amn 1: token Cognito sa7 W role Manager. Service token aw Employee yakhod 403.
  router.use('/api/dashboard', auth.requireAuth(['Manager']));

  // EN: Security check 2 (ownership): S1's GET /api/teams returns ONLY the teams this manager manages.
  //     If {teamId} is not in the list we ask S1 for the team's employees: S1 answers 404 (unknown team)
  //     or 403 (another manager's team), and we pass that on. Then load all the data in parallel.
  // Franco: Check amn 2 (el ownership): GET /api/teams men S1 beyrga3 el teams elly el manager da
  //     modeerha BAS. Law {teamId} mesh fel list bnes2al S1: yerod 404 (team mesh mawgood) aw 403
  //     (team manager tany) w bnwasselha. Ba3den bnegeeb kol el data fe nafs el wa2t.
  async function loadTeam(req) {
    const { teamId } = req.params;
    if (!UUID.test(teamId)) throw badRequest('teamId must be a UUID', [{ field: 'teamId', issue: 'not a UUID' }]);
    const ctx = { token: req.headers.authorization.slice('Bearer '.length), requestId: req.requestId };

    const teams = await upstream.getTeams(ctx);
    const team = Array.isArray(teams) ? teams.find((t) => t.id === teamId) : undefined;
    if (!team) {
      await upstream.getTeamEmployees(teamId, ctx); // EN: throws 404 or 403 / Franco: beyrmy 404 aw 403
      throw forbidden('You are not the manager of this team');
    }

    const [employees, assignments, compliance] = await Promise.all([
      upstream.getTeamEmployees(teamId, ctx),
      upstream.getTeamAssignments(teamId, ctx),
      upstream.getTeamCompliance(teamId, ctx),
    ]);
    const day = today();
    const flags = flagsFromContract(compliance, assignments, day);
    const rows = evaluateTeam(employees, assignments, flags, day);
    return { team, assignments, flags, rows, day };
  }

  // EN: small wrapper so an async error goes to the error handler (Express 4 does not do it alone).
  // Franco: wrapper so8ayyar 3ashan el error el async yero7 lel error handler (Express 4 mabey3melhash lewa7do).
  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

  // EN: 6.1 summary: compliance rate, counts and reasons for the team.
  // Franco: 6.1 el molakhas: nesbet el compliance w el a3dad w el asbab lel team.
  router.get('/api/dashboard/teams/:teamId/summary', wrap(async (req, res) => {
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
  router.get('/api/dashboard/teams/:teamId/employees', wrap(async (req, res) => {
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
  router.get('/api/dashboard/teams/:teamId/attention', wrap(async (req, res) => {
    const { rows } = await loadTeam(req);
    res.json(attentionOrder(rows).map(toRow));
  }));

  return router;
}

module.exports = { createDashboardRouter, UUID };
