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
};

export default config;
