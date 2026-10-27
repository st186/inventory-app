import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import * as api from '../utils/api';
import { APP_VERSION } from '../utils/appVersion';

const DISMISS_KEY = 'update-banner-dismissed-version';

// Numeric, segment-by-segment compare ("1.10.0" > "1.9.0") - a plain string compare would
// get that backwards, and this app's version strings are always simple dot-separated
// integers (see appVersion.ts), never pre-release suffixes.
function isNewer(latest: string, current: string): boolean {
  const a = latest.split('.').map((n) => parseInt(n, 10) || 0);
  const b = current.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/** The banner itself (info tone, dismissible). UpdateAvailableBanner decides when to show it. */
export function UpdateBanner({ version, onDismiss }: { version: string; onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-info-border bg-info-soft py-1 pr-1 pl-4 text-body-sm text-text" role="status">
      <Download className="size-5 shrink-0 text-info" aria-hidden="true" />
      <span className="min-w-0 flex-1 py-2">
        A new version (v{version}) is available - ask your admin for the updated app to get the latest fixes.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="inline-flex size-11 min-h-11 shrink-0 items-center justify-center rounded-full text-text-2 hover:bg-info-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Dismiss"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}

// A soft, dismissible nudge - never blocks using the app. Checked once per app load
// (not polled) since a version change only ever happens between sessions, not mid-session.
export function UpdateAvailableBanner() {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api.getLatestAppVersion().then((v) => {
      if (v) setLatestVersion(v);
    });
  }, []);

  useEffect(() => {
    if (latestVersion && localStorage.getItem(DISMISS_KEY) === latestVersion) {
      setDismissed(true);
    }
  }, [latestVersion]);

  if (!latestVersion || !isNewer(latestVersion, APP_VERSION) || dismissed) return null;

  const handleDismiss = () => {
    // Remembers this specific version was dismissed, not "dismissed forever" - the
    // banner comes back on its own the next time a newer build actually ships.
    localStorage.setItem(DISMISS_KEY, latestVersion);
    setDismissed(true);
  };

  return <UpdateBanner version={latestVersion} onDismiss={handleDismiss} />;
}
