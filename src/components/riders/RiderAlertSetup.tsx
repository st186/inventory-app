import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  getRiderAlertStatus, openRiderAlertSetting, riderAlertSupported, testRiderAlert,
  type RiderAlertStatus,
} from '../../utils/riderAlert';
import { ageLabel } from './tripUtils';

// Rider only (Android app): the loud horn / full-screen ride-request alert needs a few phone
// settings that Android makes the rider grant themselves. Shows what's still off, opens the right
// settings page for each, and lets the rider test the sound.
export function RiderAlertSetup() {
  const [status, setStatus] = useState<RiderAlertStatus | null>(null);

  const refresh = useCallback(() => { getRiderAlertStatus().then(setStatus); }, []);
  useEffect(() => {
    refresh();
    // Re-check when the rider comes back from a settings page.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  if (!riderAlertSupported() || !status) return null;

  const items: { key: 'notifications' | 'fullScreen' | 'doNotDisturb' | 'battery'; label: string; why: string }[] = [
    { key: 'notifications', label: 'Notifications', why: 'Needed to get ride requests at all' },
    { key: 'fullScreen', label: 'Full-screen alerts', why: 'Wakes the screen and shows over the lock screen' },
    { key: 'doNotDisturb', label: 'Ring through Do Not Disturb', why: 'So a silent or DND phone still sounds the horn' },
    { key: 'battery', label: 'No battery restriction', why: 'Stops Android delaying the alert to save battery' },
  ];
  const missing = items.filter((i) => !status[i.key]);

  return (
    <div className={`rounded-2xl border p-4 mb-5 ${missing.length === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-sm font-semibold ${missing.length === 0 ? 'text-emerald-800' : 'text-amber-900'}`}>
          {missing.length === 0 ? 'Ride alerts are ready' : 'Set up your ride alert'}
        </p>
        <button
          onClick={async () => {
            const result = await testRiderAlert();
            if (result.posted) toast.success('Test alert sent - you should hear the horn. Open the app to stop it.');
            else toast.error(`Test alert could not be shown: ${result.error || 'unknown reason'}`);
            refresh();
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-800 hover:bg-gray-50"
        >
          Test the alert
        </button>
      </div>
      <p className="text-[11px] text-gray-500 mt-2">
        {status.lastReceivedAt
          ? `Last ride request reached this phone ${ageLabel(new Date(status.lastReceivedAt).toISOString())}${status.lastError ? ` - could not show it: ${status.lastError}` : status.lastPostedAt >= status.lastReceivedAt ? ' and was shown' : ''}.`
          : 'No ride request has reached this phone yet.'}
      </p>
      {missing.length > 0 && (
        <>
          <p className="text-xs text-amber-900 mt-1">Allow these so a new ride request rings loudly even when your phone is locked or on silent.</p>
          <div className="mt-3 space-y-2">
            {missing.map((i) => (
              <div key={i.key} className="flex items-center justify-between gap-3 bg-white/70 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{i.label}</p>
                  <p className="text-xs text-gray-500">{i.why}</p>
                </div>
                <button
                  onClick={() => openRiderAlertSetting[i.key === 'doNotDisturb' ? 'doNotDisturb' : i.key]()}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 flex-shrink-0"
                >
                  Allow
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
