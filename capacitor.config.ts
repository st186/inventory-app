import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bunnymomos.inventory',
  appName: 'Bhandar-IMS',
  webDir: 'dist',
  android: {
    // Required by @capacitor-community/background-geolocation, or location updates halt about
    // five minutes after the app is backgrounded (rider live tracking).
    useLegacyBridge: true,
  },
  plugins: {
    // Live updates (src/utils/liveUpdate.ts), self-hosted: the app checks our own manifest, so
    // automatic checks against Capgo's servers stay off and no stats are sent to them.
    CapacitorUpdater: {
      autoUpdate: false,
      statsUrl: '',
    },
  },
};

export default config;
