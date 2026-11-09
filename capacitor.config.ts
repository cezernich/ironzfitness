import type { CapacitorConfig } from '@capacitor/cli';

// npm run build creates a client-only bundle for Capacitor sync. Runtime
// delivery still uses server.url; changing that is a separate mobile release.
const config: CapacitorConfig = {
  appId: 'fit.ironz.app',
  appName: 'IronZ',
  webDir: 'www',
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
