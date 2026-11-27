// EN: Service 3 reads its database login from AWS Secrets Manager (secret "ett/db/s3") at start-up, so the
//     database password is not kept in the container's environment.
//     Security rules:
//     - fail closed: if the secret cannot be read, S3 does NOT start (no silent fallback);
//     - least privilege: the secret must hold exactly the role svc_s3 (never the admin user, never another
//       service's role), which may only touch S3's own two tables;
//     - the password is never logged and never put in an error message.
//     The IAM role of S3 may read only ett/db* and ett/service-client (infra/iam/s3-policy.json).
// Franco: Service 3 bte2ra login el database men AWS Secrets Manager (secret "ett/db/s3") awel ma tebda2, 3ashan
//     password el database mayeb2ash fel environment bta3 el container.
//     Qawa3ed el amn:
//     - fail closed: law el secret mayet2erash, S3 MATEBDA2SH (mafeesh rogoo3 sakit);
//     - least privilege: el secret lazem yekoon feeh el role svc_s3 bel zabt (3omro ma el admin wala role service
//       tanya), elly mesmoo7lo yelmes el gadwaleen bto3 S3 bas;
//     - el password 3omraha ma betet-log wala betetkteb fe resalet error.
'use strict';
const { callAws, awsConfig } = require('../../common/aws');

const EXPECTED_USER = 'svc_s3';

// EN: which secret to read. Inside the Docker image (NODE_ENV=production) the default is "ett/db/s3";
//     local tests read nothing unless DB_SECRET_ID is set. DB_SECRET_ID=none switches the feature off.
// Franco: anhi secret ne2rah. Gowwa el Docker image (NODE_ENV=production) el default "ett/db/s3"; fel tests el
//     local mafeesh qeraya ella law DB_SECRET_ID mawgood. DB_SECRET_ID=none bey2fel el feature.
function dbSecretId(env = process.env) {
  if (env.DB_SECRET_ID === 'none') return null;
  if (env.DB_SECRET_ID) return env.DB_SECRET_ID;
  return env.NODE_ENV === 'production' ? 'ett/db/s3' : null;
}

// EN: read the secret and return the pool config with the login from it. The secret is JSON:
//     { "username": "svc_s3", "password": "...", "host"?, "port"?, "dbname"? }
// Franco: ne2ra el secret w nerga3 config el pool bel login elly feeh. El secret JSON:
//     { "username": "svc_s3", "password": "...", "host"?, "port"?, "dbname"? }
async function loadDbConfigFromSecret(baseConfig, {
  secretId,
  call = (target, payload) => callAws('secretsmanager', target, payload, { config: awsConfig() }),
} = {}) {
  let secret;
  try {
    const out = await call('secretsmanager.GetSecretValue', { SecretId: secretId });
    secret = JSON.parse(out.SecretString);
  } catch (err) {
    throw new Error(`Cannot read the database secret "${secretId}" from Secrets Manager (${err.awsType || 'unreadable'}). Service 3 will not start.`);
  }
  if (!secret || typeof secret.username !== 'string' || typeof secret.password !== 'string' || !secret.password) {
    throw new Error(`Secret "${secretId}" must contain a username and a password. Service 3 will not start.`);
  }
  // EN: only S3's own least-privilege role is accepted.
  // Franco: el role el mahdood bta3 S3 bas howa elly yet2ebel.
  if (secret.username !== EXPECTED_USER) {
    throw new Error(`Secret "${secretId}" must hold the least-privilege role ${EXPECTED_USER}, not "${secret.username}". Service 3 will not start.`);
  }
  return {
    ...baseConfig,
    user: secret.username,
    password: secret.password,
    host: secret.host || baseConfig.host,
    port: Number(secret.port || baseConfig.port),
    database: secret.dbname || baseConfig.database,
  };
}

module.exports = { dbSecretId, loadDbConfigFromSecret, EXPECTED_USER };
