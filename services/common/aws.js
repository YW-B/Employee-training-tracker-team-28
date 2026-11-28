// EN: A tiny AWS JSON-API client with Signature Version 4, using only Node's own crypto and fetch
//     (no npm packages, so services/common keeps zero dependencies). Used for CloudWatch Logs and
//     CloudWatch alarms. Endpoint, region and keys come from the environment (Floci locally, AWS for real).
// Franco: Client so8ayyar le AWS JSON APIs b Signature Version 4, b crypto w fetch bto3 Node bas
//     (mafeesh npm packages, f services/common mafeehash ay dependency). Bnesta3melo le CloudWatch Logs
//     w el alarms. El endpoint w el region w el keys men el environment (Floci local, AWS fel 7a2i2a).
'use strict';
const crypto = require('node:crypto');

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// EN: SigV4 signature for one POST request with a JSON body. Returns the headers to send.
//     Steps (AWS docs): canonical request -> string to sign -> signing key from the secret -> signature.
// Franco: el signature SigV4 le POST request wa7ed b JSON body. Beyrga3 el headers elly nb3atha.
//     El khatawat (docs AWS): canonical request -> string to sign -> signing key men el secret -> signature.
function signRequest({
  url, body, target, service, region, accessKeyId, secretAccessKey, sessionToken,
  contentType = 'application/x-amz-json-1.1', now = new Date(),
}) {
  const u = new URL(url);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20261123T200000Z
  const day = amzDate.slice(0, 8);
  const headers = { 'content-type': contentType, host: u.host, 'x-amz-date': amzDate };
  if (target) headers['x-amz-target'] = target; // EN: JSON APIs only / Franco: lel JSON APIs bas
  if (sessionToken) headers['x-amz-security-token'] = sessionToken;
  const names = Object.keys(headers).sort();
  const canonical = [
    'POST', u.pathname || '/', '',
    ...names.map((n) => `${n}:${headers[n]}`), '',
    names.join(';'), sha256(body),
  ].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', key).update(toSign).digest('hex');
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`,
  };
}

// EN: settings from the environment. AWS_ENDPOINT_URL points at Floci locally; on AWS it is left empty
//     and the normal regional endpoint is used.
// Franco: el settings men el environment. AWS_ENDPOINT_URL beyshawer 3ala Floci local; 3ala AWS beyfdal
//     fady w benesta3mel el endpoint el 3ady bta3 el region.
function awsConfig(env = process.env) {
  return {
    endpoint: env.AWS_ENDPOINT_URL || '',
    region: env.AWS_DEFAULT_REGION || env.AWS_REGION || 'us-east-1',
    accessKeyId: env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY || '',
    sessionToken: env.AWS_SESSION_TOKEN || '',
  };
}

// EN: call one AWS JSON action, e.g. callAws('logs', 'Logs_20140328.PutLogEvents', {...}).
//     Throws an Error with the AWS error type (never with the keys) when the call fails.
// Franco: nady action AWS JSON wa7ed. Beyrmy Error feeh no3 el error bta3 AWS (3omro ma feeh el keys) law fashal.
async function callAws(service, target, payload, { config = awsConfig(), fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  const url = config.endpoint || `https://${service}.${config.region}.amazonaws.com/`;
  const body = JSON.stringify(payload);
  const headers = signRequest({ url, body, target, service, ...config });
  delete headers.host; // EN: fetch sets Host itself / Franco: fetch beyhot el Host lewa7do
  const res = await fetchImpl(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(`${target} failed: ${String(data.__type || res.status).split('#').pop()}`);
    err.awsType = String(data.__type || '').split('#').pop();
    throw err;
  }
  return data;
}

// EN: the older "query" protocol (form fields, XML answer), used by CloudWatch alarms (PutMetricAlarm) and SNS.
//     Each AWS service has its own API version: CloudWatch = 2010-08-01 (default), SNS = 2010-03-31.
// Franco: el protocol el adeem "query" (form fields w rad XML), bey-esta3melo el CloudWatch alarms w SNS.
//     Kol service leha version: CloudWatch = 2010-08-01 (el default), SNS = 2010-03-31.
const QUERY_VERSIONS = { monitoring: '2010-08-01', sns: '2010-03-31' };

async function callAwsQuery(service, action, params, { config = awsConfig(), fetchImpl = globalThis.fetch, timeoutMs = 5000, version } = {}) {
  const url = config.endpoint || `https://${service}.${config.region}.amazonaws.com/`;
  const apiVersion = version || QUERY_VERSIONS[service] || '2010-08-01';
  const body = new URLSearchParams({ Action: action, Version: apiVersion, ...params }).toString();
  const headers = signRequest({ url, body, service, ...config, contentType: 'application/x-www-form-urlencoded; charset=utf-8' });
  delete headers.host;
  const res = await fetchImpl(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${action} failed: ${(text.match(/<Code>([^<]+)<\/Code>/) || [])[1] || res.status}`);
  return text;
}

module.exports = { signRequest, awsConfig, callAws, callAwsQuery };
