// EN: starts Service 3. Steps: (1) read the database login from Secrets Manager when a secret id is set
//     (inside the Docker image: "ett/db/s3"), failing closed if it cannot be read; (2) start the HTTP server.
//     Port comes from the environment (PORT), default 5003.
// Franco: bey-ebda2 Service 3. El khatawat: (1) ne2ra login el database men Secrets Manager law fi secret id
//     (gowwa el Docker image: "ett/db/s3"), w law mayet2erash ma nebda2sh; (2) neshaghal el HTTP server.
//     El port men el environment (PORT), w el default 5003.
'use strict';
const { createApp } = require('./app');
const { createLogger } = require('../../common/logging');
const { poolConfigFromEnv } = require('../../common/db');
const { dbSecretId, loadDbConfigFromSecret } = require('./dbSecret');

async function start(env = process.env, deps = {}) {
  const logger = deps.logger || createLogger('dashboard-reports');
  let dbConfig = null;
  const secretId = dbSecretId(env);
  if (secretId) {
    // EN: the base config only gives host/port/name/limits; user and password come from the secret.
    // Franco: el config el asasy beyedi host/port/esm/limits bas; el user w el password men el secret.
    const base = poolConfigFromEnv({ DB_HOST: 'postgres', DB_NAME: 'ett', ...env, DB_USER: 'from-secret', DB_PASSWORD: 'from-secret' });
    dbConfig = await loadDbConfigFromSecret(base, { secretId, call: deps.call });
    // EN: field names avoid "secret"/"password" on purpose (the logger hides those); the password is never logged.
    // Franco: asamy el fields men gheir "secret"/"password" 3ala gheer; el password 3omraha ma betet-log.
    logger.info('db_login_loaded', { source: `Secrets Manager ${secretId}`, dbUser: dbConfig.user });
  }
  const app = createApp({ ...deps.app, logger, dbConfig });
  const port = Number(env.PORT || 5003);
  return new Promise((resolve) => {
    const server = app.listen(port, '0.0.0.0', () => {
      logger.info('listening', { service: 'dashboard-reports', port: server.address().port });
      resolve(server);
    });
  });
}

if (require.main === module) {
  start().catch((err) => {
    // EN: fail closed: print why (no password inside the message) and stop.
    // Franco: fail closed: netba3 leh (mafeesh password fel resala) w ne2af.
    process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'dashboard-reports', event: 'startup_failed', message: err.message })}\n`);
    process.exit(1);
  });
}

module.exports = { start };
