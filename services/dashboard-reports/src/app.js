// EN: the Express app of Service 3 (no listen() call, so the tests can start it on a random port).
//     Dependencies (auth, upstream client, store, today) can be passed in, so tests use fakes for S1/S2.
// Franco: el Express app bta3 Service 3 (men gheir listen, 3ashan el tests teshaghalo 3ala port 3ashwa2i).
//     El dependencies (auth, upstream, today) momken tetba3at, f el tests betesta3mel S1/S2 mozayyafeen.
'use strict';
const express = require('express');
const { createAuth } = require('../../common/auth');
const { createLogger, requestIdMiddleware, requestLogger } = require('../../common/logging');
const { notFoundHandler, errorHandler } = require('../../common/errors');
const { createUpstream } = require('./upstream');
const { createDashboardRouter } = require('./dashboard');
const { createStore } = require('./store');
const { createReportsRouter } = require('./reports');

// EN: The real auth needs the Cognito settings from the environment. We create it on first use, so
//     /health keeps working even when those settings are missing (e.g. in the health test).
// Franco: El auth el 7a2i2i me7tag settings Cognito men el environment. Bne3melo awel ma nesta3melo,
//     3ashan /health yefdal shaghal law el settings mesh mawgooda.
function lazyAuth() {
  let real = null;
  return {
    requireAuth(roles) {
      return (req, res, next) => {
        try {
          if (!real) real = createAuth();
        } catch (err) {
          return next(err); // EN: missing config -> 500, never "let it through" / Franco: mafeesh config -> 500
        }
        return real.requireAuth(roles)(req, res, next);
      };
    },
  };
}

// EN: The database pool is also created on first use. It logs in with DB_USER from the environment,
//     which must be S3's own role svc_s3 (never the admin user); the password comes from the environment.
// Franco: El pool bta3 el database bardo beyet3emel awel ma nesta3melo. Beydkhol b DB_USER men el
//     environment, w lazem yeb2a el role bta3 S3 svc_s3 (mesh el admin); el password men el environment.
function lazyDb() {
  let real = null;
  const get = () => {
    if (!real) {
      const { Pool } = require('pg');
      const { createDb, poolConfigFromEnv } = require('../../common/db');
      real = createDb({ pool: new Pool(poolConfigFromEnv()) });
    }
    return real;
  };
  return {
    query: (sql, params) => get().query(sql, params),
    queryOne: (sql, params) => get().queryOne(sql, params),
    withTransaction: (work) => get().withTransaction(work),
  };
}

function createApp(deps = {}) {
  const logger = deps.logger || createLogger('dashboard-reports');
  const auth = deps.auth || lazyAuth();
  const upstream = deps.upstream || createUpstream();
  const store = deps.store || createStore(lazyDb());

  const app = express();
  app.disable('x-powered-by'); // EN: do not advertise the framework / Franco: mate2olsh en da Express
  app.use(requestIdMiddleware);
  app.use(requestLogger(logger));

  // EN: health check used by Docker, nginx and the team to see the service is alive (no login needed).
  // Franco: check en el service 7ayya; bey-estakhdemo Docker w nginx w e7na (mafeesh login).
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'dashboard-reports' });
  });

  app.use(createDashboardRouter({ auth, upstream, store, today: deps.today }));
  app.use(createReportsRouter({ auth, upstream, store, logger, today: deps.today }));

  app.use(notFoundHandler);
  app.use(errorHandler(logger)); // EN: must be last / Franco: lazem yeb2a akher wa7ed
  return app;
}

module.exports = { createApp };
