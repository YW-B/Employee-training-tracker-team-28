// EN: Shared by the dashboard and the reports: (1) check that the caller manages {teamId}, through S1;
//     (2) load the team's data from S1 and S2 and apply the compliance rules from compliance.js.
// Franco: Moshtarak bein el dashboard w el reports: (1) check en el caller howa manager el {teamId} 3an
//     taree2 S1; (2) tahmeel data el team men S1 w S2 w tatbee2 rules el compliance men compliance.js.
'use strict';
const { badRequest, forbidden } = require('../../common/errors');
const { evaluateTeam, flagsFromContract, todayUtc } = require('./compliance');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// EN: the caller's own token and request id, forwarded on every call to S1/S2.
// Franco: el token bta3 el caller w el request id, beyetba3to ma3 kol call le S1/S2.
function ctxOf(req) {
  return { token: req.headers.authorization.slice('Bearer '.length), requestId: req.requestId };
}

function createTeamData({ upstream, today = () => todayUtc() }) {
  // EN: Security check 2 (ownership): S1's GET /api/teams returns ONLY the teams this manager manages.
  //     If {teamId} is not in the list we ask S1 for the team's employees: S1 answers 404 (unknown team)
  //     or 403 (another manager's team), and we pass that on. Then load all the data in parallel.
  // Franco: Check amn 2 (el ownership): GET /api/teams men S1 beyrga3 el teams elly el manager da
  //     modeerha BAS. Law {teamId} mesh fel list bnes2al S1: yerod 404 (team mesh mawgood) aw 403
  //     (team manager tany) w bnwasselha. Ba3den bnegeeb kol el data fe nafs el wa2t.
  async function checkTeamAccess(req) {
    const { teamId } = req.params;
    if (!UUID.test(teamId)) throw badRequest('teamId must be a UUID', [{ field: 'teamId', issue: 'not a UUID' }]);
    const ctx = ctxOf(req);

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
    return { employees, assignments, flags, rows, day };
  }

  return { checkTeamAccess, evaluate, ctxOf };
}

module.exports = { createTeamData, ctxOf, UUID };

