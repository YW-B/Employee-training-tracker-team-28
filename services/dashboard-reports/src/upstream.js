// EN: Small client for the calls S3 makes to S1 and S2 (docs/API_CONTRACT.md section 7).
//     - forwards the caller's own Bearer token, so S1/S2 apply their own ownership rules;
//     - forwards X-Request-Id, so one user action can be followed across the three services;
//     - 3-second timeout; if S1/S2 is down or broken we throw 503/502 and NEVER return partial numbers.
// Franco: Client so8ayyar lel calls elly S3 bey3melha le S1 w S2.
//     - bey-forward el token bta3 el caller, f S1/S2 bey-apply rules el ownership bta3thom;
//     - bey-forward X-Request-Id 3ashan netaba3 el action 3abr el 3 services;
//     - timeout 3 sawani; law S1/S2 wa2e3 aw 3ando moshkela benrmy 503/502 w 3OMRENA ma nerga3 nos ar2am.
'use strict';
const {
  badRequest, unauthorized, forbidden, notFound, upstreamError, upstreamUnavailable,
} = require('../../common/errors');

function createUpstream({
  s1Url = process.env.S1_URL || 'http://s1:5001',
  s2Url = process.env.S2_URL || 'http://s2:5002',
  fetchImpl = globalThis.fetch,
  timeoutMs = 3000,
} = {}) {
  // EN: one GET to another service. Maps their answer to our errors.
  // Franco: GET wa7ed le service tanya. Bey7awwel radhom le errors bta3etna.
  async function get(serviceName, baseUrl, path, { token, requestId }) {
    let res;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, 'X-Request-Id': requestId || '', Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // EN: network error or timeout -> 503 (the other service is unavailable).
      // Franco: moshkelet network aw timeout -> 503 (el service el tanya mesh mawgooda).
      throw upstreamUnavailable(`${serviceName} is unavailable`);
    }

    // EN: S1/S2 already decided these for the same user, so we pass them on unchanged.
    // Franco: S1/S2 karraro dol le nafs el user, f bnwasselhom zay ma homma.
    if (res.status === 400) throw badRequest(`${serviceName} rejected the request`);
    if (res.status === 401) throw unauthorized('Token was rejected');
    if (res.status === 403) throw forbidden('You are not the manager of this team');
    if (res.status === 404) throw notFound('Team not found');
    if (!res.ok) throw upstreamError(`${serviceName} failed`);

    try {
      return await res.json();
    } catch {
      throw upstreamError(`${serviceName} sent an invalid answer`);
    }
  }

  const enc = encodeURIComponent;
  return {
    getMe: (ctx) => get('S1', s1Url, '/api/employees/me', ctx),
    getTeams: (ctx) => get('S1', s1Url, '/api/teams', ctx),
    getTeamEmployees: (teamId, ctx) => get('S1', s1Url, `/api/teams/${enc(teamId)}/employees`, ctx),
    getTeamAssignments: (teamId, ctx) => get('S1', s1Url, `/api/teams/${enc(teamId)}/assignments`, ctx),
    getTeamCompliance: (teamId, ctx) => get('S2', s2Url, `/api/compliance/teams/${enc(teamId)}`, ctx),
  };
}

module.exports = { createUpstream };
