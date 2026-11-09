'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildStaging } = require('../scripts/staging/build');
const root = path.resolve(__dirname, '..');
const productionConfig = fs.readFileSync(path.join(root, 'js/supabase-init.js'), 'utf8');
const result = buildStaging();
let inspected = 0;
function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { inspect(file); continue; }
    if (!/\.(js|html|json|css)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(text.includes('dagdpdcwqdlibxbitdgr'), false, `${file} must not target production`);
    assert.equal(text.includes('https://buy.stripe.com/'), false, `${file} must not offer live checkout`);
    inspected++;
  }
}
inspect(result.output);
const html = fs.readFileSync(path.join(result.output, 'index.html'), 'utf8');
assert.match(html, /STAGING · Synthetic data only/);
assert.match(html, /Content-Security-Policy/);
assert.match(html, /noindex,nofollow/);
assert.match(fs.readFileSync(path.join(result.output, 'js/supabase-init.js'), 'utf8'), /sb_publishable_/);
assert.equal(fs.readFileSync(path.join(root, 'js/supabase-init.js'), 'utf8'), productionConfig);
assert.equal(fs.existsSync(path.join(result.output, 'CNAME')), false);
assert.equal(fs.existsSync(path.join(result.output, 'supabase')), false);
assert.match(fs.readFileSync(path.join(result.output, 'js/sentry-init.js'), 'utf8'), /production Sentry disabled/);
console.log(`PASS: ${inspected} staging assets inspected; production backend, checkout, telemetry and CNAME excluded; production source unchanged.`);
