// EN: Creates or updates the Secrets Manager secret "ett/db/s3" that Service 3 reads at start-up:
//     { username: "svc_s3", password, host, port, dbname }. Run it from the repo root after
//     "python scripts/dev.py init" and "node infra/db/load.js all", then restart s3:
//         node services/dashboard-reports/scripts/put-db-secret.js
//     The password comes from your local, git-ignored .env (DB_S3_PASSWORD) and is NEVER printed.
//     Floci keeps secrets in memory, so run it again after Floci restarts (same as "dev.py init").
//     On real AWS an administrator (or secret rotation) creates this secret instead.
// Franco: Beye3mel aw ye-update el secret "ett/db/s3" elly Service 3 bte2rah awel ma tebda2. Shaghalo men
//     awel el repo ba3d "dev.py init" w "load.js all", w ba3den e3mel restart le s3.
//     El password men el .env el local (DB_S3_PASSWORD) w 3OMRO ma beyet-teba3. Floci beyekhazzen el secrets
//     fel memory, f shaghalo tany ba3d ma Floci ye3mel restart (zay "dev.py init").
'use strict';
const path = require('node:path');
const { callAws } = require('../../common/aws');
const { hostAwsConfig } = require('../../../scripts/aws_host_config');
const { readEnvFile } = require('../../../tests/security/lib');

const SECRET_ID = 'ett/db/s3';

async function main() {
  const env = { ...readEnvFile(path.resolve(__dirname, '..', '..', '..', '.env')), ...process.env };
  if (!env.DB_S3_PASSWORD) throw new Error('DB_S3_PASSWORD is missing in .env');
  const config = hostAwsConfig();
  const SecretString = JSON.stringify({
    username: 'svc_s3',
    password: env.DB_S3_PASSWORD,
    host: env.DB_HOST || 'postgres',
    port: Number(env.DB_PORT || 5432),
    dbname: env.POSTGRES_DB || 'ett',
  });
  try {
    await callAws('secretsmanager', 'secretsmanager.PutSecretValue', { SecretId: SECRET_ID, SecretString }, { config });
    console.log(`Updated secret ${SECRET_ID} (username svc_s3; password not printed).`);
  } catch (err) {
    if (err.awsType !== 'ResourceNotFoundException') throw err;
    await callAws('secretsmanager', 'secretsmanager.CreateSecret', {
      Name: SECRET_ID, SecretString, Description: 'Service 3 database login (least-privilege role svc_s3)',
    }, { config });
    console.log(`Created secret ${SECRET_ID} (username svc_s3; password not printed).`);
  }
}

main().catch((err) => { console.error(`Could not store the secret: ${err.message}`); process.exit(1); });
