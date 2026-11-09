'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildWeb } = require('../scripts/build-web');
const root = path.resolve(__dirname, '..');

const result = buildWeb();
for (const file of [
  'index.html', 'js/auth.js', 'js/db.js', 'js/variant-libraries/run.js',
  'assets/faq.json', 'assets/icons/icon-192.png', 'share/index.html',
  'c/index.html', '.well-known/apple-app-site-association',
  'sources-of-truth/philosophy/modules_static.json',
]) {
  assert.deepEqual(fs.readFileSync(path.join(result.output, file)), fs.readFileSync(path.join(root, file)));
}
for (const file of ['supabase', 'functions', 'migrations', '.temp', '.git', '.env', 'docs', 'tests', 'scripts', 'package.json', 'new features']) {
  assert.equal(fs.existsSync(path.join(result.output, file)), false, `${file} must not ship`);
}

// The previous command left backend source in www. Rebuild must remove it.
fs.mkdirSync(path.join(result.output, 'functions'), { recursive: true });
fs.writeFileSync(path.join(result.output, 'functions', 'stale-test-file'), 'test only');
buildWeb();
assert.equal(fs.existsSync(path.join(result.output, 'functions')), false);

// A newly introduced missing script must fail packaging instead of shipping.
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ironz-build-test-'));
try {
  fs.cpSync(result.output, fixture, { recursive: true });
  fs.appendFileSync(path.join(fixture, 'index.html'), '\n<script src="js/not-packaged.js"></script>');
  assert.throws(() => buildWeb(fixture), /Missing packaged asset/);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
console.log(`PASS: ${result.files} client files; runtime assets preserved, backend excluded, stale output removed, missing assets rejected.`);
