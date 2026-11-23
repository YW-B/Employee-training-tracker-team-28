// EN: Unit tests for the shared frontend helpers (frontend/common/auth.js and api.js), run in Node with a
//     tiny fake browser (sessionStorage, location, fetch). Run: node --test tests/frontend/common.test.js
// Franco: Unit tests lel helpers el moshtaraka fel frontend, betshtaghal fe Node b browser mozayyaf so8ayyar
//     (sessionStorage, location, fetch). Shaghalha: node --test tests/frontend/common.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');

// ---------- a tiny fake browser ----------
// EN: just enough of window for the helpers: storage, location and fetch.
// Franco: el 7etta elly el helpers me7tagaha men window bas: storage, location, fetch.
const store = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.location = { href: '/s3/dashboard.html', pathname: '/s3/dashboard.html' };
globalThis.FormData = class FormData {};
globalThis.ETT_CONFIG = { cognitoEndpoint: '/cognito/', cognitoClientId: 'web-client' };

const auth = require('../../frontend/common/auth');
const api = require('../../frontend/common/api');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims) => `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`;
const inMinutes = (m) => Math.floor(Date.now() / 1000) + m * 60;
const signInAs = (claims) => store.set('ett.tokens', JSON.stringify({ accessToken: jwt(claims) }));
const reply = (status, body) => ({ ok: status < 300, status, json: async () => body, blob: async () => body });

test.beforeEach(() => {
  store.clear();
  globalThis.location.href = '/s3/dashboard.html';
});

// ---------- auth ----------
test('decodeToken reads the claims; a broken token gives null', () => {
  assert.deepStrictEqual(auth.decodeToken(jwt({ sub: 'u1', exp: 5 })), { sub: 'u1', exp: 5 });
  assert.strictEqual(auth.decodeToken('not-a-token'), null);
});

test('isExpired: valid, expired, within the 30 s margin, unreadable', () => {
  assert.strictEqual(auth.isExpired(jwt({ exp: inMinutes(10) })), false);
  assert.strictEqual(auth.isExpired(jwt({ exp: inMinutes(-1) })), true);
  assert.strictEqual(auth.isExpired(jwt({ exp: Math.floor(Date.now() / 1000) + 10 })), true);
  assert.strictEqual(auth.isExpired('garbage'), true);
});

test('currentUser keeps only Employee/Manager roles; an expired token signs the tab out', () => {
  signInAs({ sub: 'm1', exp: inMinutes(10), 'cognito:groups': ['Manager', 'Admin'] });
  assert.deepStrictEqual(auth.currentUser(), { sub: 'm1', roles: ['Manager'] });
  signInAs({ sub: 'm1', exp: inMinutes(-5), 'cognito:groups': ['Manager'] });
  assert.strictEqual(auth.currentUser(), null);
  assert.strictEqual(store.has('ett.tokens'), false);
});

test('requireSignIn: no token -> sign-in page; wrong role -> home; right role -> user', () => {
  assert.strictEqual(auth.requireSignIn(['Manager']), null);
  assert.strictEqual(globalThis.location.href, '/index.html');
  signInAs({ sub: 'e1', exp: inMinutes(10), 'cognito:groups': ['Employee'] });
  assert.strictEqual(auth.requireSignIn(['Manager']), null);
  assert.strictEqual(globalThis.location.href, '/home.html');
  signInAs({ sub: 'm1', exp: inMinutes(10), 'cognito:groups': ['Manager'] });
  assert.strictEqual(auth.requireSignIn(['Manager']).sub, 'm1');
});

test('signIn: tokens saved on success; MFA challenge returns the session', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return reply(200, { AuthenticationResult: { AccessToken: jwt({ exp: inMinutes(15) }), RefreshToken: 'r' } });
  };
  assert.deepStrictEqual(await auth.signIn('a@b.c', 'pw'), { done: true });
  assert.strictEqual(calls[0].url, '/cognito/');
  assert.strictEqual(calls[0].opts.headers['X-Amz-Target'], 'AWSCognitoIdentityProviderService.InitiateAuth');
  assert.deepStrictEqual(JSON.parse(calls[0].opts.body).AuthParameters, { USERNAME: 'a@b.c', PASSWORD: 'pw' });
  assert.ok(store.has('ett.tokens'));

  globalThis.fetch = async () => reply(200, { ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: 's1' });
  assert.deepStrictEqual(await auth.signIn('m@b.c', 'pw'), { mfa: true, session: 's1', email: 'm@b.c' });
});

// EN: wrong e-mail and wrong password give the SAME message (no account guessing).
// Franco: el email el ghalat w el password el ghalat beyedo NAFS el resala (mafeesh takhmeen lel accounts).
test('signIn: wrong e-mail and wrong password give the same message', async () => {
  for (const type of ['NotAuthorizedException', 'UserNotFoundException']) {
    globalThis.fetch = async () => reply(400, { __type: type });
    await assert.rejects(auth.signIn('x@y.z', 'bad'), { message: 'Wrong e-mail or password.' });
  }
});

test('confirmMfa refuses a code that is not 6 digits, without calling Cognito', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return reply(200, {}); };
  await assert.rejects(auth.confirmMfa({ session: 's', email: 'm' }, '12ab'), /6 digits/);
  assert.strictEqual(called, false);
});

// ---------- api ----------
test('api.get sends the Bearer token and returns JSON', async () => {
  const token = jwt({ exp: inMinutes(10), 'cognito:groups': ['Manager'] });
  store.set('ett.tokens', JSON.stringify({ accessToken: token }));
  let seen;
  globalThis.fetch = async (url, opts) => { seen = { url, opts }; return reply(200, { ok: 1 }); };
  assert.deepStrictEqual(await api.get('/api/teams'), { ok: 1 });
  assert.strictEqual(seen.opts.headers.Authorization, `Bearer ${token}`);
  assert.strictEqual(seen.opts.method, 'GET');
});

test('api: error body message is shown; missing message falls back to a friendly text', async () => {
  signInAs({ exp: inMinutes(10) });
  globalThis.fetch = async () => reply(403, { error: { code: 'FORBIDDEN', message: 'You are not the manager of this team' } });
  await assert.rejects(api.get('/x'), { status: 403, code: 'FORBIDDEN', message: 'You are not the manager of this team' });
  globalThis.fetch = async () => reply(503, {});
  await assert.rejects(api.get('/x'), { status: 503, message: 'A service is not available right now. Please try again.' });
});

test('api: 401 signs out and sends the user to the sign-in page', async () => {
  signInAs({ exp: inMinutes(10) });
  globalThis.fetch = async () => reply(401, {});
  await assert.rejects(api.get('/x'), { status: 401 });
  assert.strictEqual(store.has('ett.tokens'), false);
});

test('api: no token at all -> no request is sent', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return reply(200, {}); };
  await assert.rejects(api.get('/x'), { status: 401 });
  assert.strictEqual(called, false);
});

test('api.post sends a JSON body; DELETE 204 returns null', async () => {
  signInAs({ exp: inMinutes(10) });
  let seen;
  globalThis.fetch = async (url, opts) => { seen = opts; return reply(204, null); };
  assert.strictEqual(await api.post('/x', { a: 1 }), null);
  assert.strictEqual(seen.headers['Content-Type'], 'application/json');
  assert.strictEqual(seen.body, '{"a":1}');
  assert.strictEqual(await api.del('/x'), null);
});
