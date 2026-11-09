'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { buildWeb } = require('../build-web');
const ROOT = path.resolve(__dirname, '../..');
const EXPECTED_REF = 'yhchfxjzxhinreklnxbi';

function buildStaging() {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/staging.json'), 'utf8'));
  if (config.projectRef !== EXPECTED_REF || config.supabaseUrl !== `https://${EXPECTED_REF}.supabase.co`
      || !config.publishableKey.startsWith('sb_publishable_')) {
    throw new Error('Staging configuration must use the isolated project and a public client key');
  }
  const original = fs.readFileSync(path.join(ROOT, 'js/supabase-init.js'), 'utf8');
  const productionKey = original.match(/const SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)/)[1];
  const productionRef = original.match(/https:\/\/([a-z]+)\.supabase\.co/)[1];
  const built = buildWeb(ROOT);
  const output = path.join(ROOT, 'www-staging');
  fs.rmSync(output, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  fs.cpSync(built.output, output, { recursive: true });
  fs.rmSync(path.join(output, 'CNAME'));

  const csp = `<meta http-equiv="Content-Security-Policy" content="connect-src 'self' ${config.supabaseUrl} wss://${EXPECTED_REF}.supabase.co; form-action 'self'; object-src 'none'; base-uri 'self'">`;
  const banner = '<aside role="status" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#6d3700;color:#fff;text-align:center;font:12px/24px system-ui;pointer-events:none">STAGING · Synthetic data only · Live integrations disabled</aside>';
  function transform(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { transform(file); continue; }
      if (!/\.(js|html|json|css)$/.test(file)) continue;
      let text = fs.readFileSync(file, 'utf8');
      text = text.split(productionKey).join(config.publishableKey)
        .split(productionRef).join(EXPECTED_REF)
        .split('https://ironz.fit').join(config.previewUrl)
        .replace(/https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+/g, '#staging-payments-disabled');
      if (file.endsWith('.html')) {
        text = text.replace(/<head>/i, `<head>\n${csp}\n<meta name="robots" content="noindex,nofollow">`)
          .replace(/<body([^>]*)>/i, `<body$1>${banner}`);
      }
      fs.writeFileSync(file, text);
    }
  }
  transform(output);
  fs.writeFileSync(path.join(output, 'js/sentry-init.js'), '// Staging telemetry is isolated: production Sentry disabled.\n');
  fs.writeFileSync(path.join(output, 'staging-build.json'), JSON.stringify({
    environment: 'staging', projectRef: EXPECTED_REF, liveIntegrations: false,
    sourceCommit: require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
  }, null, 2));
  return { output, config };
}
if (require.main === module) console.log(`Built isolated staging client into ${buildStaging().output}`);
module.exports = { buildStaging };
