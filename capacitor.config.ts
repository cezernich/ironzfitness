import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fit.ironz.app',
  appName: 'IronZ',
  webDir: 'Plan',
  server: {
    url: 'https://ironz.fit',
    cleartext: false
  }
};

export default config;
