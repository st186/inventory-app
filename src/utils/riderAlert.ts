// JS side of the rider's loud ride-request alert (native code: RiderCallAlert.java /
// RiderAlertPlugin.java). The alert itself is raised natively when the push arrives; this only
// reports which phone settings it still needs, opens them, tests the sound and silences it.
import { Capacitor, registerPlugin } from '@capacitor/core';

export type RiderAlertStatus = {
  notifications: boolean;   // notifications (and the ride-request channel) are allowed
  fullScreen: boolean;      // may wake the screen / show over the lock screen (Android 14+ runtime grant)
  doNotDisturb: boolean;    // may ring through Do Not Disturb
  battery: boolean;         // exempt from battery optimisation so the alert isn't delayed
  lastReceivedAt: number;   // ms epoch: when the last ride-request push reached this phone (0 = never)
  lastPostedAt: number;     // ms epoch: when the alert was actually put on screen
  lastError: string;        // why the last alert could not be shown ('' = no problem)
  lastPath: string;         // 'ringing-service' (horn + vibration) or 'backup-notification'
  ringing: boolean;         // the horn is sounding right now
};

interface RiderAlertPlugin {
  getStatus(): Promise<RiderAlertStatus>;
  openNotificationSettings(): Promise<void>;
  openFullScreenSettings(): Promise<void>;
  openDoNotDisturbSettings(): Promise<void>;
  openBatterySettings(): Promise<void>;
  test(): Promise<{ posted: boolean; error: string }>;
  isRinging(): Promise<{ ringing: boolean }>;
  stop(): Promise<void>;
}

const RiderAlert = registerPlugin<RiderAlertPlugin>('RiderAlert');

export const riderAlertSupported = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export async function getRiderAlertStatus(): Promise<RiderAlertStatus | null> {
  if (!riderAlertSupported()) return null;
  try { return await RiderAlert.getStatus(); } catch { return null; }
}

export const openRiderAlertSetting = {
  notifications: () => RiderAlert.openNotificationSettings().catch(() => {}),
  fullScreen: () => RiderAlert.openFullScreenSettings().catch(() => {}),
  doNotDisturb: () => RiderAlert.openDoNotDisturbSettings().catch(() => {}),
  battery: () => RiderAlert.openBatterySettings().catch(() => {}),
};

export const testRiderAlert = (): Promise<{ posted: boolean; error: string }> =>
  riderAlertSupported()
    ? RiderAlert.test().catch((e) => ({ posted: false, error: e instanceof Error ? e.message : 'The alert plugin is not available in this build' }))
    : Promise.resolve({ posted: false, error: 'Only available in the Android app' });
export const isRiderAlertRinging = async (): Promise<boolean> => {
  if (!riderAlertSupported()) return false;
  try { return (await RiderAlert.isRinging()).ringing; } catch { return false; }
};
export const stopRiderAlert = () => (riderAlertSupported() ? RiderAlert.stop().catch(() => {}) : Promise.resolve());
