// EN: Unit tests for the security-suite helpers and the secret review (no running stack needed).
//     Run: node --test tests/security/lib.test.js
// Franco: Unit tests le helpers el security suite w moraj3et el secrets (mesh me7tageen el stack shaghal).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { redact, tamper, unsignedToken, writeResults, http } = require('./lib');
const { RULES } = require('../../scripts/secret_review');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = `${b64({ alg: 'RS256' })}.${b64({ sub: 'u1', 'cognito:groups': ['Employee'] })}.c2lnbmF0dXJlLXZhbHVl`;

// EN: nothing secret may reach the evidence files.
// Franco: mafeesh 7aga secret tewsal le files el evidence.
test('redact hides JWTs, Bearer values and secret-named keys at any depth', () => {
  const out = redact({
    note: `got ${fakeJwt} back`,
    headers: { Authorization: `Bearer ${fakeJwt}` },
    nested: [{ accessToken: 'abc', password: 'p', ok: 'Bearer xyz.abc' }],
  });
  const text = JSON.stringify(out);
  assert.ok(!text.includes('eyJ'));
  assert.ok(!text.includes('xyz.abc'));
  assert.strictEqual(out.headers.Authorization, '[REDACTED]');
  assert.strictEqual(out.nested[0].accessToken, '[REDACTED]');
  assert.strictEqual(out.nested[0].password, '[REDACTED]');
  assert.match(out.note, /\[REDACTED_JWT\]/);
});

test('tamper changes the payload but keeps the old signature', () => {
  const forged = tamper(fakeJwt, { 'cognito:groups': ['Manager'] });
  const [h, p, s] = forged.split('.');
  assert.strictEqual(s, fakeJwt.split('.')[2]);
  assert.strictEqual(h, fakeJwt.split('.')[0]);
  assert.deepStrictEqual(JSON.parse(Buffer.from(p, 'base64url'))['cognito:groups'], ['Manager']);
});

test('unsignedToken builds an alg:none token with an empty signature', () => {
  const t = unsignedToken({ sub: 'x' });
  assert.strictEqual(JSON.parse(Buffer.from(t.split('.')[0], 'base64url')).alg, 'none');
  assert.ok(t.endsWith('.'));
});

test('http returns status 0 instead of throwing when nothing answers', async () => {
  const r = await http('http://127.0.0.1:9', 'GET', '/');
  assert.strictEqual(r.status, 0);
});

test('writeResults writes the table, the summary and redacted raw files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-'));
  const counts = writeResults([
    { id: 'T01', scenario: 'No token', expected: '401', actual: '401', result: 'PASS', steps: [{ request: 'GET /x', status: 401, body: { token: fakeJwt } }] },
    { id: 'T02', scenario: 'a | b', expected: '403', actual: '200', result: 'FAIL', steps: [] },
    { id: 'T04', scenario: 'Expired', expected: '401', actual: 'not run', result: 'SKIPPED', note: 'run later', steps: [] },
  ], { outDir: dir, now: new Date('2026-11-23T20:00:00Z'), baseUrl: 'https://localhost:8443' });
  assert.deepStrictEqual(counts, { PASS: 1, FAIL: 1, SKIPPED: 1 });
  const md = fs.readFileSync(path.join(dir, 'security_test_results.md'), 'utf8');
  assert.match(md, /\*\*Summary:\*\* 1 passed, 1 failed, 1 skipped, 3 total\./);
  assert.match(md, /\| T02 \| a \\\| b \| 403 \| 200 \| \*\*FAIL\*\* \|/);
  assert.match(md, /- \*\*T04:\*\* run later/);
  assert.ok(!fs.readFileSync(path.join(dir, 'raw', 'T01.json'), 'utf8').includes('eyJ'));
});

// EN: the secret review must catch real-looking secrets and ignore variable names / env lookups.
// Franco: moraj3et el secrets lazem temsek el secrets el 7a2i2eya w tet-tnatt asamy el variables.
// EN: the fake values are split into two strings, so the secret review of THIS file does not flag them.
// Franco: el 2eyam el fake ma2soomeen le stringein, 3ashan moraj3et el secrets lel file da matmsekhomsh.
const shouldFind = [
  ['AWS access key id', `key = ${'AKIA'}${'ABCDEFGHIJKLMNOP'}`],
  ['private key block', `-----BEGIN RSA ${'PRIVATE KEY'}-----`],
  ['SendGrid API key', 'SG.abcdefghijklmnopqrst.abcdefghijklmnopqrstuvwx'],
  ['password written in code', "const password = 'S3cr3tValue!'"],
];
for (const [name, line] of shouldFind) {
  test(`secret review finds: ${name}`, () => assert.ok(RULES.find((r) => r.name === name).re.test(line)));
}
const shouldIgnore = ["ALTER ROLE svc_s1 WITH LOGIN PASSWORD :'s1_password';", 'const pw = process.env.DB_PASSWORD;', 'password: ${{ secrets.X }}'];
for (const line of shouldIgnore) {
  test(`secret review ignores: ${line}`, () => assert.ok(!RULES.some((r) => r.re.test(line))));
}
