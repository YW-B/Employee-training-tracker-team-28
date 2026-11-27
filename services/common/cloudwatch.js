// EN: CloudWatch Logs shipper. The logger still prints every line to stdout (Docker keeps it); when
//     CLOUDWATCH_LOG_GROUP is set (/ett/s1, /ett/s2, /ett/s3) the same line is also sent to CloudWatch.
//     - Lines are already redacted by logging.js before they arrive here (no tokens, no passwords).
//     - Lines are batched (every 2 seconds or 50 lines) to make few calls.
//     - CloudWatch being down NEVER breaks the service: the batch is dropped and ONE warning is printed.
//     - At most 1000 lines wait in memory; older ones are dropped first.
// Franco: CloudWatch Logs shipper. El logger lessa beyetba3 kol satr 3al stdout (Docker beyekhazzeno); w law
//     CLOUDWATCH_LOG_GROUP mawgood (/ett/s1, /ett/s2, /ett/s3) nafs el satr beyetba3at le CloudWatch kaman.
//     - El sotoor mamsoo7 menha el secrets fe logging.js abl ma tewsal hena (mafeesh tokens wala passwords).
//     - Bengamma3 el sotoor (kol 2 sanya aw 50 satr) 3ashan ne3mel calls 2aleela.
//     - Law CloudWatch wa2e3 3OMRO ma beykassar el service: el batch betetrmy w warning WA7ED beyetba3.
//     - 1000 satr bel kteer mestanneyin fel memory; el adeem beyetrmy el awel.
'use strict';
const os = require('node:os');
const { callAws, awsConfig } = require('./aws');

function createCloudWatchShipper({
  logGroup,
  streamName = `${os.hostname()}-${new Date().toISOString().slice(0, 10)}-${process.pid}`,
  call = (target, payload) => callAws('logs', target, payload, { config: awsConfig() }),
  flushEveryMs = 2000,
  maxBatch = 50,
  maxQueue = 1000,
  warn = (msg) => process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', event: 'cloudwatch_unavailable', message: msg })}\n`),
} = {}) {
  const queue = [];
  let streamReady = false;
  let warned = false;
  let sending = false;
  let timer = null;

  // EN: create our log stream once (the log group itself is created by infra/floci/init.py).
  // Franco: ne3mel el log stream bta3na mara wa7da (el log group nafso beyet3emel fe infra/floci/init.py).
  async function ensureStream() {
    if (streamReady) return;
    try {
      await call('Logs_20140328.CreateLogStream', { logGroupName: logGroup, logStreamName: streamName });
    } catch (err) {
      if (err.awsType !== 'ResourceAlreadyExistsException') throw err;
    }
    streamReady = true;
  }

  async function flush() {
    if (sending || !queue.length) return;
    sending = true;
    const batch = queue.splice(0, maxBatch);
    try {
      await ensureStream();
      await call('Logs_20140328.PutLogEvents', {
        logGroupName: logGroup,
        logStreamName: streamName,
        logEvents: batch.map((e) => ({ timestamp: e.timestamp, message: e.message })),
      });
      warned = false;
    } catch (err) {
      // EN: drop this batch and warn once; the lines are still in stdout (docker logs).
      // Franco: nermy el batch di w ne7azzar mara wa7da; el sotoor lessa fel stdout (docker logs).
      if (!warned) warn(`CloudWatch Logs not reachable (${err.message}); logs stay in stdout`);
      warned = true;
      streamReady = false;
    } finally {
      sending = false;
    }
    if (queue.length >= maxBatch) await flush();
  }

  function push(line) {
    queue.push({ timestamp: Date.now(), message: line });
    if (queue.length > maxQueue) queue.splice(0, queue.length - maxQueue);
    if (queue.length >= maxBatch) flush();
    if (!timer) {
      timer = setInterval(flush, flushEveryMs);
      timer.unref(); // EN: never keeps the process alive on shutdown / Franco: mayseebsh el process 3ayesh
    }
  }

  return { push, flush, queue, streamName };
}

module.exports = { createCloudWatchShipper };
