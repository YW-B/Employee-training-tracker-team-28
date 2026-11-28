// EN: Runs the two daily jobs NOW, the same way the scheduler does at 01:00 / 01:30 UTC:
//     (1) reads the service client from Secrets Manager (ett/service-client), (2) gets a Service token from
//     Cognito with client credentials, (3) calls S2 run-check, then S3 run-snapshot (which also publishes the
//     SNS daily summary). Useful for the demo: the trend chart gets today's point.
//     Run from the repo root (stack up, cognito_init.js done):   node scripts/run_daily_jobs.js
//     The token and the client secret are never printed.
// Franco: Beyshaghal el 2 jobs el yomeya DELWA2TY, zay el scheduler: (1) ye2ra el service client men Secrets Manager,
//     (2) yakhod Service token men Cognito b client credentials, (3) yenadi S2 run-check ba3dein S3 run-snapshot
//     (elly beyeb3at kaman el SNS daily summary). Mofeed lel demo: el trend chart beyakhod no2tet el naharda.
//     El token w el secret 3omrohom ma beyetba3o.
'use strict';
const path = require('node:path');
const { callAws } = require('../services/common/aws');
const { hostAwsConfig } = require('./aws_host_config');
const { readEnvFile } = require('../tests/security/lib');

const ROOT = path.join(__dirname, '..');

async function serviceToken(config) {
  const secret = await callAws('secretsmanager', 'secretsmanager.GetSecretValue', { SecretId: 'ett/service-client' }, { config });
  const { clientId, clientSecret } = JSON.parse(secret.SecretString);
  const gen = readEnvFile(path.join(ROOT, 'infra', 'floci', 'cognito', 'cognito.generated.env'));
  const poolId = gen.COGNITO_USER_POOL_ID || '';
  const base = config.endpoint.replace(/\/$/, '');
  // EN: AWS uses https://<domain>.auth.<region>.amazoncognito.com/oauth2/token; emulators differ, so we try a few.
  // Franco: AWS beyesta3mel domain lel Cognito; el emulators mokhtalfa, f bnegarrab kaza 3enwan.
  const urls = [process.env.COGNITO_TOKEN_URL, `${base}/oauth2/token`, poolId && `${base}/${poolId}/oauth2/token`, `${base}/_aws/cognito-idp/oauth2/token`].filter(Boolean);
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials&scope=ett-api%2Fjobs.run',
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.access_token) {
        console.log(`OK   Service token from ${url.replace(base, '<floci>')} (not printed)`);
        return data.access_token;
      }
      console.log(`--   ${url.replace(base, '<floci>')} -> HTTP ${res.status}`);
    } catch (err) {
      console.log(`--   ${url.replace(base, '<floci>')} -> ${err.message}`);
    }
  }
  throw new Error('no token endpoint worked (write it in docs/LIMITATIONS.md; the jobs still run on the schedule on AWS)');
}

async function job(name, url, token) {
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  console.log(`${res.ok ? 'OK  ' : 'FAIL'} ${name}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return res.ok;
}

async function main() {
  const config = hostAwsConfig();
  const token = await serviceToken(config);
  // EN: straight to the service ports on this PC (5002 / 5003), so no certificate is needed.
  // Franco: 3ala ports el services 3ala el gehaz (5002 / 5003) 3alatool, f mesh me7tageen certificate.
  const a = await job('S2 run-check', 'http://localhost:5002/api/compliance/run-check', token);
  const b = await job('S3 run-snapshot (+ SNS daily summary)', 'http://localhost:5003/api/dashboard/run-snapshot', token);
  process.exitCode = a && b ? 0 : 1;
}

main().catch((err) => { console.log(`FAIL ${err.message}`); process.exitCode = 1; });
