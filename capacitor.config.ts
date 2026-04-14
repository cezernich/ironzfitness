import type { CapacitorConfig } from '@capacitor/cli';

// webDir is intentionally set to the repo root: the iOS WebView loads
// from server.url (ironz.fit) at runtime, so this value is only used by
// `npx cap sync` when/if we ever switch to bundled mode. Previously it
// pointed at "Plan", which was deleted in the repo reorg — leaving it
// pointing at a non-existent folder was the bug that triggered this fix.
const config: CapacitorConfig = {
  appId: 'fit.ironz.app',
  appName: 'IronZ',
  webDir: '.',
  server: {
    url: 'https://ironz.fit',
    cleartext: false
  }
};

export default config;
