// EN: Security test suite: controlled attacks against the RUNNING stack through nginx (HTTPS), with the
//     expected result, the actual result recorded from the run, and PASS / FAIL. It writes
//     docs/evidence/security_test_results.md and redacted raw responses in docs/evidence/raw/.
//     Run (stack up, seed + Cognito users loaded):   node tests/security/run_security_tests.js
//     Exit code 0 = no FAIL. Settings: .env (TEST_USER_PASSWORD) and cognito.generated.env, or ETT_BASE_URL.
// Franco: Security test suite: hogoom mowagaha 3ala el stack el SHAGHAL 3an taree2 nginx (HTTPS), feeha el
//     natiga el motawaqqa3a, w el natiga el fe3leya men el tashgheel, w PASS / FAIL. Beyekteb
//     docs/evidence/security_test_results.md w el responses mamsoo7a fe docs/evidence/raw/.
//     Shaghalo (el stack shaghal w el seed w users Cognito mawgoodeen):   node tests/security/run_security_tests.js
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// EN: trust our own self-signed certificate (certs/server.crt) instead of turning TLS checks off.
//     Node reads NODE_EXTRA_CA_CERTS only at start-up, so we start ourselves again once with it set.
//     If the PC already uses its own extra CA file (antivirus, company proxy), we keep it: both files are
//     joined into one temporary bundle, because Node accepts only one file there.
// Franco: neseddaa2 el certificate bta3na (certs/server.crt) badal ma ne2fel check el TLS.
//     Node beye2ra NODE_EXTRA_CA_CERTS wa2t el bedaya bas, f benshaghal nafsena tany mara wa7da beeh.
//     Law el gehaz 3ando CA file tany (antivirus, proxy el shereka) bnseebo: bengamma3 el etnein fe file
//     wa7ed mo2a2at, 3ashan Node beyakhod file wa7ed bas.
const CA = path.resolve(__dirname, '..', '..', 'certs', 'server.crt');
if (!process.env.ETT_CA_READY && fs.existsSync(CA)) {
  let bundle = CA;
  const existing = process.env.NODE_EXTRA_CA_CERTS;
  if (existing && path.resolve(existing) !== CA && fs.existsSync(existing)) {
    bundle = path.join(os.tmpdir(), 'ett-ca-bundle.pem');
    fs.writeFileSync(bundle, `${fs.readFileSync(existing, 'utf8')}\n${fs.readFileSync(CA, 'utf8')}`);
  }
  const r = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, NODE_EXTRA_CA_CERTS: bundle, ETT_CA_READY: '1' },
  });
  process.exit(r.status === null ? 1 : r.status);
}

const { REPO, loadSettings, http, signIn, tamper, unsignedToken, writeResults } = require('./lib');

// EN: ids from infra/db/seed.sql
// Franco: el ids men infra/db/seed.sql
const IDS = {
  OPS: '10000000-0000-4000-8000-000000000001', // Operations, manager Mona
  LAB: '10000000-0000-4000-8000-000000000002', // Laboratory, manager Omar
  AHMED: '20000000-0000-4000-8000-000000000002',
  SARA: '20000000-0000-4000-8000-000000000003',
  FIRST_AID: '30000000-0000-4000-8000-000000000002',
  RANDOM: '99999999-0000-4000-8000-000000000001',
};
const USERS = { mona: 'mona.manager@example.com', omar: 'omar.manager@example.com', ahmed: 'ahmed@example.com', sara: 'sara@example.com' };
const CACHE = path.join(__dirname, '.cache', 'old-token.json');

class Skip extends Error {}

const tests = [];
// EN: register one test: id, scenario, expected result, and the function that runs it.
// Franco: nsaggel test wa7ed: el id, el scenario, el natiga el motawaqqa3a, w el function elly bteshaghalo.
function test(id, scenario, expected, run) { tests.push({ id, scenario, expected, run }); }

// EN: a small PDF/PNG/EXE-looking file for upload tests (built in memory, nothing on disk).
// Franco: file so8ayyar shakl PDF/EXE le tests el upload (fel memory, mafeesh 7aga 3ala el disk).
function uploadForm(bytes, fileName, type = 'application/pdf') {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), fileName);
  form.append('trainingId', IDS.FIRST_AID);
  form.append('title', 'Security test certificate');
  form.append('issuer', 'Security test');
  form.append('issueDate', '2026-01-01');
  form.append('expiryDate', '2027-01-01');
  return form;
}

// ---------------------------------------------------------------- authentication (401)
test('T01', 'No token on S1 GET /api/assignments/me', '401', async (c) => {
  const r = await c.call('GET', '/api/assignments/me');
  return { actual: String(r.status), pass: r.status === 401 };
});

test('T02', 'No token on S2 GET /api/certificates/me', '401', async (c) => {
  const r = await c.call('GET', '/api/certificates/me');
  return { actual: String(r.status), pass: r.status === 401 };
});

test('T03', 'No token on S3 GET /api/dashboard/teams/{Operations}/summary', '401', async (c) => {
  const r = await c.call('GET', `/api/dashboard/teams/${IDS.OPS}/summary`);
  return { actual: String(r.status), pass: r.status === 401 };
});

// EN: a REAL Cognito token that has expired. Each run saves a fresh token; a run 16+ minutes later uses it.
// Franco: token Cognito 7a2i2i khalas. Kol run beysayyev token gedeed; run ba3do b 16 de2ee2a aw aktar beyesta3melo.
test('T04', 'Expired real access token (older than 15 minutes) on S1, S2 and S3', '401 on all three', async (c) => {
  if (!fs.existsSync(CACHE)) throw new Skip('No saved token yet: this run saved one. Run the suite again after 16 minutes.');
  const saved = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const ageMin = (Date.now() - saved.savedAt) / 60000;
  if (ageMin < 16) throw new Skip(`The saved token is only ${ageMin.toFixed(1)} minutes old. Run again after 16 minutes.`);
  const codes = [];
  for (const p of ['/api/assignments/me', '/api/certificates/me', `/api/dashboard/teams/${IDS.OPS}/summary`]) {
    codes.push((await c.call('GET', p, { token: saved.token })).status);
  }
  return { actual: codes.join(', '), pass: codes.every((s) => s === 401), note: `token age ${ageMin.toFixed(0)} minutes` };
});

test('T05', 'Tampered token (Employee changes his group to Manager, signature kept) and an unsigned "alg: none" token on S3', '401 and 401', async (c) => {
  const forged = tamper(c.tokens.ahmed, { 'cognito:groups': ['Manager'] });
  const none = unsignedToken({ ...JSON.parse(Buffer.from(c.tokens.ahmed.split('.')[1], 'base64url')), 'cognito:groups': ['Manager'] });
  const a = await c.call('GET', `/api/dashboard/teams/${IDS.OPS}/summary`, { token: forged });
  const b = await c.call('GET', `/api/dashboard/teams/${IDS.OPS}/summary`, { token: none });
  return { actual: `${a.status} and ${b.status}`, pass: a.status === 401 && b.status === 401 };
});

// ---------------------------------------------------------------- authorisation (403)
test('T06', 'Employee calls S1 POST /api/assignments (manager only)', '403', async (c) => {
  const r = await c.call('POST', '/api/assignments', { token: c.tokens.ahmed, json: { employeeId: IDS.SARA, trainingId: IDS.FIRST_AID, dueDate: '2027-01-31' } });
  return { actual: String(r.status), pass: r.status === 403 };
});

test('T07', 'Employee calls S2 PATCH /api/certificates/{id}/verify (manager only)', '403', async (c) => {
  const r = await c.call('PATCH', `/api/certificates/${IDS.RANDOM}/verify`, { token: c.tokens.ahmed, json: { decision: 'verify', reason: null } });
  return { actual: String(r.status), pass: r.status === 403 };
});

test('T08', 'Employee calls S3 GET /api/dashboard/teams/{Operations}/summary (manager only)', '403', async (c) => {
  const r = await c.call('GET', `/api/dashboard/teams/${IDS.OPS}/summary`, { token: c.tokens.ahmed });
  return { actual: String(r.status), pass: r.status === 403 };
});

test('T09', "Manager of Laboratory asks for Operations' dashboard and report (S3)", '403 and 403', async (c) => {
  const a = await c.call('GET', `/api/dashboard/teams/${IDS.OPS}/summary`, { token: c.tokens.omar });
  const b = await c.call('GET', `/api/reports/teams/${IDS.OPS}`, { token: c.tokens.omar });
  return { actual: `${a.status} and ${b.status}`, pass: a.status === 403 && b.status === 403 };
});

// EN: IDOR: Sara changes the id in the URL to read Ahmed's data.
// Franco: IDOR: Sara beteghayyar el id fel URL 3ashan te2ra data Ahmed.
test('T10', "IDOR: employee Sara reads employee Ahmed's profile (S1) and one of his certificates (S2)", '403 (S1) and 403 (S2)', async (c) => {
  const s1 = await c.call('GET', `/api/employees/${IDS.AHMED}`, { token: c.tokens.sara });
  const list = await c.call('GET', `/api/certificates?teamId=${IDS.OPS}`, { token: c.tokens.mona });
  const target = Array.isArray(list.body) ? list.body.find((x) => x.employeeId !== IDS.SARA) : null;
  if (!target) {
    return { actual: `${s1.status} (S1); S2 not tested: no certificate of another employee exists`, pass: s1.status === 403, note: 'Upload one certificate as Ahmed, then run again to cover the S2 part.' };
  }
  const s2 = await c.call('GET', `/api/certificates/${target.id}`, { token: c.tokens.sara });
  return { actual: `${s1.status} (S1) and ${s2.status} (S2)`, pass: s1.status === 403 && s2.status === 403 };
});

// ---------------------------------------------------------------- input validation
test('T11', 'Invalid input: past dueDate (S1), executable renamed to .pdf (S2), bad ?status= (S3)', '400, 415, 400', async (c) => {
  const a = await c.call('POST', '/api/assignments', { token: c.tokens.mona, json: { employeeId: IDS.SARA, trainingId: IDS.FIRST_AID, dueDate: '2020-01-01' } });
  const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2048, 0x90)]);
  const b = await c.call('POST', '/api/certificates', { token: c.tokens.ahmed, form: uploadForm(exe, 'certificate.pdf') });
  const d = await c.call('GET', `/api/dashboard/teams/${IDS.OPS}/employees?status=late`, { token: c.tokens.mona });
  return { actual: `${a.status}, ${b.status}, ${d.status}`, pass: a.status === 400 && b.status === 415 && d.status === 400 };
});

test('T12', "SQL injection string in query parameters (S1 trainings category, S3 report category)", 'no 500; no rows leak (200 with 0 rows, or 400)', async (c) => {
  const evil = encodeURIComponent("' OR '1'='1' --");
  const a = await c.call('GET', `/api/trainings?category=${evil}`, { token: c.tokens.ahmed });
  const b = await c.call('GET', `/api/reports/teams/${IDS.OPS}?category=${evil}`, { token: c.tokens.mona });
  const okA = a.status === 400 || (a.status === 200 && Array.isArray(a.body) && a.body.length === 0);
  const okB = b.status === 400 || (b.status === 200 && b.body && Array.isArray(b.body.rows) && b.body.rows.length === 0);
  const rows = (r, list) => (r.status === 200 ? `${list.length} rows` : '');
  return {
    actual: `S1 ${a.status} ${rows(a, a.body || [])}; S3 ${b.status} ${rows(b, (b.body && b.body.rows) || [])}`.trim(),
    pass: okA && okB,
  };
});

test('T13', 'Oversize upload: a 5.5 MB file with a valid PDF header (S2)', '413', async (c) => {
  const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5.5 * 1024 * 1024, 0x20)]);
  const r = await c.call('POST', '/api/certificates', { token: c.tokens.ahmed, form: uploadForm(big, 'big.pdf') });
  return { actual: String(r.status), pass: r.status === 413 };
});

// ---------------------------------------------------------------- secrets and storage
test('T14', 'Secret exposure review of every tracked file (scripts/secret_review.js)', 'PASS (no secret found)', async () => {
  const r = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'secret_review.js')], { cwd: REPO, encoding: 'utf8' });
  const last = (r.stdout || '').trim().split('\n').pop();
  return { actual: last || `exit ${r.status}`, pass: r.status === 0 };
});

// EN: storage is only reachable through a signed, short-lived link: the website exposes no bucket path,
//     and a download link carries a signature and a 300-second expiry.
// Franco: el storage mesh beyetwesel ella b link mamdi w 3omro 2osayyar: el website mabey3redsh el bucket,
//     w link el download feeh signature w expiry 300 sanya.
test('T15', 'Direct storage access without a pre-signed URL; the download URL is signed and short-lived', 'bucket not reachable through the website (404); URL signed, expiry <= 300 s', async (c) => {
  const direct = await c.call('GET', '/certificates/');
  const mine = await c.call('GET', '/api/certificates/me', { token: c.tokens.ahmed });
  const cert = Array.isArray(mine.body) ? mine.body[0] : null;
  if (!cert) {
    return { actual: `website /certificates/ -> ${direct.status}; no own certificate to check the link`, pass: direct.status === 404, note: 'Upload one certificate as Ahmed, then run again to check the pre-signed URL.' };
  }
  const dl = await c.call('GET', `/api/certificates/${cert.id}/download`, { token: c.tokens.ahmed });
  const url = (dl.body && (dl.body.url || dl.body.downloadUrl)) || '';
  const expires = Number((url.match(/X-Amz-Expires=(\d+)/) || [])[1]);
  const signed = /X-Amz-Signature=/.test(url);
  return {
    actual: `website /certificates/ -> ${direct.status}; link signed: ${signed}; expiry ${expires || 'none'} s`,
    pass: direct.status === 404 && signed && expires > 0 && expires <= 300,
    note: 'Floci itself does not enforce signatures or expiry (docs/FLOCI_SPIKE.md); on AWS, Block Public Access refuses unsigned reads.',
  };
});

// EN: a training name that is an Excel formula must come out as text in the CSV export.
// Franco: esm training 3ebara 3an formula Excel lazem yetla3 ka text fel CSV.
test('T16', 'CSV formula injection: a training named =HYPERLINK(...) in the S3 CSV export', "cell starts with '= (escaped)", async (c) => {
  const stamp = Date.now();
  const name = `=HYPERLINK("http://evil.example","x") ${stamp}`;
  const t = await c.call('POST', '/api/trainings', { token: c.tokens.mona, json: { name, category: 'SecTest', requiresCertificate: false, validityMonths: null } });
  if (t.status !== 201 || !t.body) return { actual: `could not create the test training (S1 ${t.status})`, pass: false };
  const a = await c.call('POST', '/api/assignments', { token: c.tokens.mona, json: { employeeId: IDS.SARA, trainingId: t.body.id, dueDate: '2027-12-31' } });
  if (a.status !== 201) return { actual: `could not assign the test training (S1 ${a.status})`, pass: false };
  const csv = await c.call('GET', `/api/reports/teams/${IDS.OPS}/export?category=SecTest`, { token: c.tokens.mona });
  const line = csv.text.split(/\r?\n/).find((l) => l.includes(String(stamp))) || '';
  const escaped = /(^|,)"?'=HYPERLINK/.test(line);
  return { actual: line ? `cell: ${line.split(',').slice(1, 2).join('')}` : `no row in CSV (${csv.status})`, pass: escaped };
});

// ---------------------------------------------------------------- transport
test('T17', 'Transport: HTTP is redirected to HTTPS; security headers on the website', '301/308 to https; HSTS, CSP, nosniff present', async (c, s) => {
  const plain = await http(s.baseUrl.replace('https://', 'http://').replace(':8443', ':8080'), 'GET', '/');
  const page = await c.call('GET', '/index.html');
  const h = page.headers;
  const ok = [301, 302, 307, 308].includes(plain.status) && /^https:/.test(plain.headers.location || '')
    && h['strict-transport-security'] && h['content-security-policy'] && h['x-content-type-options'] === 'nosniff';
  return {
    actual: `HTTP ${plain.status} -> ${plain.headers.location || 'none'}; HSTS ${h['strict-transport-security'] ? 'yes' : 'no'}, CSP ${h['content-security-policy'] ? 'yes' : 'no'}, nosniff ${h['x-content-type-options'] || 'no'}`,
    pass: Boolean(ok),
  };
});

// ---------------------------------------------------------------- runner
async function main() {
  const s = loadSettings();
  if (!s.clientId || !s.password) {
    console.error('Missing COGNITO_WEB_CLIENT_ID or TEST_USER_PASSWORD (run cognito_init.js; check .env).');
    process.exit(2);
  }
  console.log(`Signing in test users through ${s.baseUrl}/cognito/ ...`);
  const tokens = {};
  for (const [key, email] of Object.entries(USERS)) {
    tokens[key] = await signIn(s, email);
    if (!tokens[key]) {
      console.error(`Could not sign in ${email}. Is the stack up and were the Cognito users created?`);
      process.exit(2);
    }
  }

  const results = [];
  for (const t of tests) {
    const steps = [];
    // EN: every call is recorded (method, path, status, short body) for the raw evidence file.
    // Franco: kol call beyetsaggel (method, path, status, body 2osayyar) lel file el raw.
    const c = {
      tokens,
      async call(method, p, opts = {}) {
        const r = await http(s.baseUrl, method, p, opts);
        steps.push({ request: `${method} ${p}`, withToken: Boolean(opts.token), status: r.status, body: r.body !== null ? r.body : r.text.slice(0, 300) });
        return r;
      },
    };
    let out;
    try {
      out = await t.run(c, s);
      out.result = out.pass ? 'PASS' : 'FAIL';
    } catch (err) {
      out = err instanceof Skip
        ? { actual: 'not run', result: 'SKIPPED', note: err.message }
        : { actual: `error: ${err.message}`, result: 'FAIL' };
    }
    results.push({ id: t.id, scenario: t.scenario, expected: t.expected, steps, ...out });
    console.log(`${t.id} ${out.result.padEnd(7)} expected ${t.expected} | actual ${out.actual}`);
  }

  // EN: save a fresh real token for T04 of the next run (git-ignored folder, deleted after use).
  // Franco: nsayyev token 7a2i2i gedeed le T04 fel run elly gai (folder git-ignored).
  if (!fs.existsSync(CACHE) || (Date.now() - JSON.parse(fs.readFileSync(CACHE, 'utf8')).savedAt) / 60000 >= 16) {
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify({ token: tokens.ahmed, savedAt: Date.now() }));
  }

  const counts = writeResults(results, { baseUrl: s.baseUrl });
  console.log(`\n${counts.PASS} passed, ${counts.FAIL} failed, ${counts.SKIPPED} skipped. Results: docs/evidence/security_test_results.md`);
  process.exit(counts.FAIL ? 1 : 0);
}

main();
