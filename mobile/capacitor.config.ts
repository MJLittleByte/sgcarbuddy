import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Permanent Play Store identity — do not change after the first release.
  appId: 'com.sgcarbuddy.app',
  appName: 'SG Car Buddy',
  webDir: 'dist',
  plugins: {
    // Edge-to-edge: Capacitor injects --safe-area-inset-* CSS variables (used in styles/app.css).
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
  },
  android: {
    // Only for pointing a dev build at `wrangler dev` over plain http (e.g. http://10.0.2.2:8787).
    // Release builds must use the https Worker URL, so leave this off unless CAP_DEV_HTTP=1.
    allowMixedContent: process.env.CAP_DEV_HTTP === '1',
  },
};

export default config;
