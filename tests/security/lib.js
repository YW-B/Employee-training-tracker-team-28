// EN: Helpers for the security test suite: settings, sign-in, HTTP calls through nginx, redaction of
//     tokens before anything is saved, and writing the results table. No npm packages needed (Node 20+).
// Franco: Helpers le security test suite: el settings, el login, el calls 3an taree2 nginx, mas7 el tokens
//     abl ma ay 7aga tetsayyev, w kitabet gadwal el nata2eg. Mesh me7tageen ay npm package (Node 20+).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');

// EN: read KEY=value lines from a file (missing file -> {}).
// Franco: ne2ra sotoor KEY=value men file (law mesh mawgood -> {}).
function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
}

// EN: settings come from the environment first, then .env and the Cognito ids file (all local, git-ignored).
// Franco: el settings men el environment el awel, ba3den .env w file el Cognito ids (kollohom local w git-ignored).
function loadSettings(env = process.env) {
  const files = { ...readEnvFile(path.join(REPO, '.env')), ...readEnvFile(path.join(REPO, 'infra', 'floci', 'cognito', 'cognito.generated.env')) };
  const pick = (k, d) => env[k] || files[k] || d;
  return {
    baseUrl: pick('ETT_BASE_URL', 'https://localhost:8443'),
    clientId: pick('COGNITO_WEB_CLIENT_ID', ''),
    password: pick('TEST_USER_PASSWORD', ''),
  };
}

// EN: hide secrets before anything is printed or saved: JWTs, Bearer values, and secret-named JSON keys.
// Franco: nekhabby el secrets abl ma ay 7aga tetteba3 aw tetsayyev: el JWTs w el Bearer w el keys elly asamyha secret.
const SECRET_KEY = /token|password|secret|authorization|session|apikey|api_key/i;
function redact(value) {
  if (typeof value === 'string') {
    return value
      .replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '[REDACTED_JWT]')
      .replace(/(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]');
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? '[REDACTED]' : redact(v)]));
  }
  return value;
}

// EN: one HTTP call. Returns { status, body, text, headers } and never throws on 4xx/5xx.
//     A network error returns status 0, so a test can report "no answer" instead of crashing.
// Franco: call wa7ed. Beyrga3 { status, body, text, headers } w mabeyrmeesh error 3ala 4xx/5xx.
//     Law fi moshkelet network beyrga3 status 0, f el test ye2ool "mafeesh rad" badal ma yewa22a3.
async function http(baseUrl, method, urlPath, { token, json, form, headers = {}, fetchImpl = fetch } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  try {
    const res = await fetchImpl(new URL(urlPath, baseUrl), { method, headers: h, body, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, body: parsed, text, headers: Object.fromEntries(res.headers) };
  } catch (err) {
    return { status: 0, body: null, text: String(err.cause ? err.cause.code || err.cause.message : err.message), headers: {} };
  }
}

// EN: sign in through nginx /cognito/ (the same route the browser uses). Returns the access token or null.
// Franco: login 3an taree2 nginx /cognito/ (nafs taree2 el browser). Beyrga3 el access token aw null.
async function signIn(settings, email, fetchImpl = fetch) {
  const res = await http(settings.baseUrl, 'POST', '/cognito/', {
    fetchImpl,
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
    form: JSON.stringify({ AuthFlow: 'USER_PASSWORD_AUTH', ClientId: settings.clientId, AuthParameters: { USERNAME: email, PASSWORD: settings.password } }),
  });
  return (res.body && res.body.AuthenticationResult && res.body.AuthenticationResult.AccessToken) || null;
}

// EN: change the payload of a real token WITHOUT re-signing it (a tampered token must be refused).
// Franco: neghayyar el payload bta3 token 7a2i2i MEN GHEIR ma nemdeeh tany (el token el mot3addel lazem yetrefed).
function tamper(token, changes) {
  const [head, payload, sig] = token.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  return `${head}.${Buffer.from(JSON.stringify({ ...claims, ...changes })).toString('base64url')}.${sig}`;
}

// EN: a token with "alg": "none" and no signature at all.
// Franco: token "alg": "none" w mafeehoosh signature khales.
function unsignedToken(claims) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'none', typ: 'JWT' })}.${b(claims)}.`;
}

// EN: write docs/evidence/security_test_results.md and one redacted raw file per test.
//     Every "actual" value comes from the real run; nothing is typed by hand.
// Franco: nekteb docs/evidence/security_test_results.md w file raw mamsoo7 le kol test.
//     Kol 2eemet "actual" gaya men el tashgheel el 7a2i2i; mafeesh 7aga mektooba b-eedena.
function writeResults(results, { outDir = path.join(REPO, 'docs', 'evidence'), now = new Date(), baseUrl = '' } = {}) {
  const rawDir = path.join(outDir, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const counts = { PASS: 0, FAIL: 0, SKIPPED: 0 };
  for (const r of results) counts[r.result] += 1;
  const lines = [
    '# Security test results',
    '',
    `Generated by \`node tests/security/run_security_tests.js\` on ${now.toISOString()} against ${baseUrl || 'the local stack'} (nginx, HTTPS).`,
    'Every "Actual" value below was recorded from that run. Raw responses (tokens redacted) are in `raw/`.',
    '',
    `**Summary:** ${counts.PASS} passed, ${counts.FAIL} failed, ${counts.SKIPPED} skipped, ${results.length} total.`,
    '',
    '| ID | Scenario | Expected | Actual | Result | Evidence |',
    '|---|---|---|---|---|---|',
  ];
  for (const r of results) {
    const file = `raw/${r.id}.json`;
    fs.writeFileSync(path.join(outDir, file), `${JSON.stringify(redact({ id: r.id, scenario: r.scenario, steps: r.steps }), null, 2)}\n`);
    lines.push(`| ${r.id} | ${cell(r.scenario)} | ${cell(r.expected)} | ${cell(r.actual)} | **${r.result}** | [${file}](${file}) |`);
  }
  const notes = results.filter((r) => r.note);
  if (notes.length) {
    lines.push('', '## Notes', '');
    for (const r of notes) lines.push(`- **${r.id}:** ${r.note}`);
  }
  fs.writeFileSync(path.join(outDir, 'security_test_results.md'), `${lines.join('\n')}\n`);
  return counts;
}

module.exports = { REPO, readEnvFile, loadSettings, redact, http, signIn, tamper, unsignedToken, writeResults };
