// EN: Makes "suspicious activity" ON PURPOSE so the logs and the alarm have something real to show:
//     12 requests with a forged token (-> 401) and 6 requests by an employee to manager pages (-> 403),
//     spread over S1, S2 and S3 through nginx. Only for the local demo stack.
//     Run from the repo root:   node scripts/generate_suspicious_activity.js
// Franco: Beye3mel "nashat moreeb" 3ALA GHEIR 3ashan el logs w el alarm yeb2a feehom 7aga 7a2i2eya:
//     12 request b token mozawwar (-> 401) w 6 requests men mowazzaf le pages el manager (-> 403),
//     3ala S1 w S2 w S3 3an taree2 nginx. Lel stack el local bta3 el demo bas.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// EN: trust our self-signed certificate (same way as the security suite).
// Franco: neseddaa2 el certificate bta3na (nafs tare2et el security suite).
const CA = path.resolve(__dirname, '..', 'certs', 'server.crt');
if (!process.env.ETT_CA_READY && fs.existsSync(CA)) {
  const r = spawnSync(process.execPath, [__filename], { stdio: 'inherit', env: { ...process.env, NODE_EXTRA_CA_CERTS: CA, ETT_CA_READY: '1' } });
  process.exit(r.status === null ? 1 : r.status);
}

const { loadSettings, http, signIn, unsignedToken } = require('../tests/security/lib');

const OPS = '10000000-0000-4000-8000-000000000001';
const PATHS_401 = ['/api/assignments/me', '/api/certificates/me', `/api/dashboard/teams/${OPS}/summary`];
const PATHS_403 = ['/api/assignments', `/api/dashboard/teams/${OPS}/summary`, `/api/reports/teams/${OPS}`];

async function main() {
  const s = loadSettings();
  const forged = unsignedToken({ sub: 'attacker', 'cognito:groups': ['Manager'], exp: Math.floor(Date.now() / 1000) + 600 });
  const counts = {};
  const hit = async (method, p, token, json) => {
    const r = await http(s.baseUrl, method, p, { token, json });
    counts[r.status] = (counts[r.status] || 0) + 1;
  };
  for (let i = 0; i < 4; i += 1) for (const p of PATHS_401) await hit('GET', p, forged);
  const employee = s.clientId && s.password ? await signIn(s, 'ahmed@example.com') : null;
  if (employee) {
    for (let i = 0; i < 2; i += 1) {
      await hit('POST', PATHS_403[0], employee, { employeeId: OPS, trainingId: OPS, dueDate: '2030-01-01' });
      await hit('GET', PATHS_403[1], employee);
      await hit('GET', PATHS_403[2], employee);
    }
  } else {
    console.log('Could not sign in the test employee, so only the 401 part ran.');
  }
  console.log(`Sent ${Object.values(counts).reduce((a, b) => a + b, 0)} requests. Status codes: ${JSON.stringify(counts)}`);
  console.log('Wait about 10 seconds, then run: node scripts/security_log_queries.js');
}

main();
