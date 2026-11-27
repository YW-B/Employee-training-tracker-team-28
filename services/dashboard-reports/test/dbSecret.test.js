// EN: Tests for reading S3's database login from Secrets Manager (src/dbSecret.js) and for the start-up in
//     src/server.js: success, fail closed, least privilege, no password in errors or logs.
//     Secrets Manager is a fake function here; nothing is sent over the network.
// Franco: Tests le qerayet login el database bta3 S3 men Secrets Manager (src/dbSecret.js) w le el bedaya fe
//     src/server.js: naga7, fail closed, least privilege, w mafeesh password fel errors wala el logs.
//     Secrets Manager hena function mozayyafa; mafeesh 7aga betetba3at 3al network.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { dbSecretId, loadDbConfigFromSecret } = require('../src/dbSecret');
const { start } = require('../src/server');

const BASE = { host: 'postgres', port: 5432, database: 'ett', user: 'from-secret', password: 'from-secret', max: 5 };
const PASSWORD = 'very-private-db-password-123';
const secretCall = (secret) => async (target, payload) => {
  assert.strictEqual(target, 'secretsmanager.GetSecretValue');
  assert.strictEqual(payload.SecretId, 'ett/db/s3');
  return { SecretString: JSON.stringify(secret) };
};

// ---------- which secret ----------
test('dbSecretId: production default, explicit id, switched off, local tests', () => {
  assert.strictEqual(dbSecretId({ NODE_ENV: 'production' }), 'ett/db/s3');
  assert.strictEqual(dbSecretId({ DB_SECRET_ID: 'ett/db/other' }), 'ett/db/other');
  assert.strictEqual(dbSecretId({ NODE_ENV: 'production', DB_SECRET_ID: 'none' }), null);
  assert.strictEqual(dbSecretId({}), null);
});

// ---------- reading it ----------
test('loads the svc_s3 login (and optional host/port/dbname) from the secret', async () => {
  const cfg = await loadDbConfigFromSecret(BASE, {
    secretId: 'ett/db/s3',
    call: secretCall({ username: 'svc_s3', password: PASSWORD, host: 'db.internal', port: 6543, dbname: 'ett2' }),
  });
  assert.deepStrictEqual(
    { user: cfg.user, password: cfg.password, host: cfg.host, port: cfg.port, database: cfg.database, max: cfg.max },
    { user: 'svc_s3', password: PASSWORD, host: 'db.internal', port: 6543, database: 'ett2', max: 5 },
  );
});

// EN: fail closed: no secret -> no start, and the error names the secret but never a password.
// Franco: fail closed: mafeesh secret -> mafeesh bedaya, w el error beyzkor esm el secret mesh ay password.
test('fail closed: secret missing or Secrets Manager down', async () => {
  const missing = async () => { const e = new Error('nope'); e.awsType = 'ResourceNotFoundException'; throw e; };
  await assert.rejects(loadDbConfigFromSecret(BASE, { secretId: 'ett/db/s3', call: missing }),
    /Cannot read the database secret "ett\/db\/s3" .*ResourceNotFoundException.*will not start/);
  const down = async () => { throw new Error('ECONNREFUSED'); };
  await assert.rejects(loadDbConfigFromSecret(BASE, { secretId: 'ett/db/s3', call: down }), /will not start/);
});

// EN: least privilege: only svc_s3 is accepted (not the admin, not another service's role).
// Franco: least privilege: svc_s3 bas yet2ebel (mesh el admin, wala role service tanya).
for (const username of ['ett_admin', 'postgres', 'svc_s1', 'svc_s2']) {
  test(`refuses the role "${username}" and never shows its password`, async () => {
    await assert.rejects(
      loadDbConfigFromSecret(BASE, { secretId: 'ett/db/s3', call: secretCall({ username, password: PASSWORD }) }),
      (err) => /least-privilege role svc_s3/.test(err.message) && !err.message.includes(PASSWORD),
    );
  });
}

test('refuses a secret without a password, or that is not JSON', async () => {
  await assert.rejects(loadDbConfigFromSecret(BASE, { secretId: 'ett/db/s3', call: secretCall({ username: 'svc_s3', password: '' }) }), /username and a password/);
  await assert.rejects(loadDbConfigFromSecret(BASE, { secretId: 'ett/db/s3', call: async () => ({ SecretString: 'not json' }) }), /Cannot read/);
});

// ---------- start-up ----------
function memoryLogger() {
  const lines = [];
  const log = (level) => (event, fields = {}) => lines.push({ level, event, ...fields });
  return { lines, debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') };
}

test('start: reads the secret, logs where the login came from (no password), and serves /health', async () => {
  const logger = memoryLogger();
  const server = await start(
    { NODE_ENV: 'production', PORT: '0', DB_HOST: 'postgres', DB_NAME: 'ett' },
    { logger, call: secretCall({ username: 'svc_s3', password: PASSWORD }) },
  );
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/health`);
    assert.strictEqual(res.status, 200);
    const loaded = logger.lines.find((l) => l.event === 'db_login_loaded');
    assert.deepStrictEqual({ source: loaded.source, dbUser: loaded.dbUser }, { source: 'Secrets Manager ett/db/s3', dbUser: 'svc_s3' });
    assert.ok(!JSON.stringify(logger.lines).includes(PASSWORD));
  } finally {
    server.close();
  }
});

test('start: fails closed (no server) when the secret cannot be read', async () => {
  const logger = memoryLogger();
  await assert.rejects(
    start({ NODE_ENV: 'production', PORT: '0' }, { logger, call: async () => { throw new Error('down'); } }),
    /will not start/,
  );
  assert.ok(!logger.lines.some((l) => l.event === 'listening'));
});
