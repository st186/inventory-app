import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
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

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm">
      <Sparkles className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 min-w-0">
        A new version (v{latestVersion}) is available - ask your admin for the updated app to get the latest fixes.
      </span>
      <button
        onClick={handleDismiss}
        className="p-1 rounded-full hover:bg-white/20 transition-colors flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
