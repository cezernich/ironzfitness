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
  },
  ios: {
    // Let the WebView render edge-to-edge under the status bar + home
    // indicator. The CSS handles per-component insets via
    // env(safe-area-inset-*) combined with viewport-fit=cover in
    // index.html. Default ("automatic") adds hidden padding that
    // fights our safe-area-aware layout.
    contentInset: 'never'
  }
};

export default config;
