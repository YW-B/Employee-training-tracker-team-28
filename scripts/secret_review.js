// EN: Secret exposure review: scans every file git tracks for things that look like real secrets
//     (AWS keys, private keys, SendGrid keys, JWTs, passwords written in code) and checks that no .env file
//     is tracked. Exit 0 = nothing found, 1 = something found (printed WITHOUT the secret value itself).
//     Run from the repo root:   node scripts/secret_review.js
//     This is a quick local check; the CI job (gitleaks) scans every push and pull request as well.
// Franco: Moraj3et ta2reeb el secrets: beyfattesh kol file git beytaba3o 3ala 7agat shakl-ha secrets 7a2i2eya
//     (AWS keys, private keys, SendGrid keys, JWTs, passwords mektooba fel code) w bey-check en mafeesh .env
//     metraba3. Exit 0 = mafeesh 7aga, 1 = la2ena 7aga (betetteba3 MEN GHEIR el secret nafso).
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// EN: what a leaked secret looks like. Dummy values in .env.example and in tests are allowed (see ALLOW).
// Franco: shakl el secret el mtsarreb. El 2eyam el dummy fe .env.example w fel tests masmoo7a (shoof ALLOW).
const RULES = [
  { name: 'AWS access key id', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'private key block', re: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { name: 'SendGrid API key', re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/ },
  { name: 'JSON Web Token', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  // EN: a quoted value of 8+ characters after password= / secret: ... (a variable NAME like :'s1_password' is skipped).
  // Franco: 2eema ben quotes 8 7roof aw aktar ba3d password= / secret: ... (esm variable zay :'s1_password' beyet-tnatt).
  { name: 'password written in code', re: /\b(password|passwd|pwd|secret)\s*[:=]\s*['"](?![^'"]*(password|secret|_pw|\$\{))[^'"\s]{8,}['"]/i },
];

// EN: known dummy values and files where test data is expected.
// Franco: 2eyam dummy ma3roofa w files el test data fiha tabe3eya.
const ALLOW_VALUES = ['Test@12345678', 'change-me', 'dummy', 'example', 'localpassword', 'postgres'];
const ALLOW_FILES = [/^\.env\.example$/, /(^|\/)test(s)?\//, /(^|\/)test-support\//, /\.test\.js$/, /^scripts\/secret_review\.js$/];

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
}

function review(files = trackedFiles()) {
  const findings = [];
  for (const file of files) {
    // EN: a tracked .env file is a finding on its own (only .env.example may be committed).
    // Franco: law fi .env metraba3 da lewa7do moshkela (.env.example bas elly yet-commit).
    if (/(^|\/)\.env(\.|$)/.test(file) && !/\.env\.example$/.test(file)) findings.push({ file, line: 0, rule: 'tracked .env file' });
    const full = path.join(ROOT, file);
    let text;
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024) continue;
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\u0000')) continue; // EN: binary file / Franco: file binary
    const allowedFile = ALLOW_FILES.some((re) => re.test(file));
    text.split(/\r?\n/).forEach((line, i) => {
      for (const rule of RULES) {
        if (!rule.re.test(line)) continue;
        if (allowedFile && rule.name !== 'private key block' && rule.name !== 'AWS access key id') continue;
        if (ALLOW_VALUES.some((v) => line.includes(v))) continue;
        findings.push({ file, line: i + 1, rule: rule.name });
      }
    });
  }
  return findings;
}

if (require.main === module) {
  const files = trackedFiles();
  const findings = review(files);
  for (const f of findings) console.log(`FOUND ${f.rule} in ${f.file}${f.line ? `:${f.line}` : ''}`);
  console.log(findings.length ? `FAIL: ${findings.length} possible secret(s) in ${files.length} tracked files` : `PASS: no secrets found in ${files.length} tracked files`);
  process.exit(findings.length ? 1 : 0);
}

module.exports = { review, RULES };
