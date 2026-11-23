// EN: AWS settings for scripts that run on YOUR PC (not inside Docker): read from the environment or .env,
//     and "http://floci:4566" (the name inside Docker) becomes "http://localhost:4566" (the port on your PC).
// Franco: settings AWS lel scripts elly beteshtaghal 3ala GEHAZAK (mesh gowwa Docker): men el environment aw
//     .env, w "http://floci:4566" (el esm gowwa Docker) beyb2a "http://localhost:4566" (el port 3ala gehazak).
'use strict';
const path = require('node:path');
const { readEnvFile } = require('../tests/security/lib');
const { awsConfig } = require('../services/common/aws');

function hostAwsConfig(env = process.env) {
  const file = readEnvFile(path.join(__dirname, '..', '.env'));
  const merged = { ...file, ...env };
  const config = awsConfig(merged);
  config.endpoint = (config.endpoint || '').replace('://floci:', '://localhost:');
  if (!config.accessKeyId) { config.accessKeyId = 'test'; config.secretAccessKey = 'test'; } // EN: Floci dummy keys / Franco: keys dummy lel Floci
  return config;
}

module.exports = { hostAwsConfig, LOG_GROUPS: ['/ett/s1', '/ett/s2', '/ett/s3'] };
