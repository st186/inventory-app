import { useEffect, useState, type ReactNode } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import * as api from '../utils/api';
import { APP_VERSION, isNewerVersion } from '../utils/appVersion';
import { applyUpdateNow, getLiveUpdateState, liveUpdatesOn, onLiveUpdateState, type LiveUpdateState } from '../utils/liveUpdate';
import { useT } from '../utils/i18n';

const DISMISS_KEY = 'update-banner-dismissed-version';

/** The banner itself (info tone, dismissible), with an optional action button. */
export function UpdateBanner({ version, onDismiss, text, action }: { version: string; onDismiss: () => void; text?: ReactNode; action?: ReactNode }) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-3 border-b border-info-border bg-info-soft py-1 pr-1 pl-4 text-body-sm text-text" role="status">
      <Download className="size-5 shrink-0 text-info" aria-hidden="true" />
      <span className="min-w-0 flex-1 py-2">
        {text ?? `A new version (v${version}) is available - ask your admin for the updated app to get the latest fixes.`}
      </span>
      {action}
      <button
        type="button"
        onClick={onDismiss}
        className="inline-flex size-11 min-h-11 shrink-0 items-center justify-center rounded-full text-text-2 hover:bg-info-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t('common.close')}
      >
        <X className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}

const ACTION = 'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-info px-4 text-body-sm font-semibold text-on-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

// A soft, dismissible nudge - never blocks using the app.
// - Android app: from the live-update manifest (utils/liveUpdate.ts). A newer APK gets a
//   Download button (the phone's browser downloads it and Android asks to install); a live
//   update that has downloaded says it switches in on the next open, with Restart now.
// - Browser: GET /app-version, checked once per load (a reload already brings the new site).
export function UpdateAvailableBanner() {
  const { t } = useT();
  const native = liveUpdatesOn();
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [live, setLive] = useState<LiveUpdateState>(getLiveUpdateState);
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try { return localStorage.getItem(DISMISS_KEY); } catch { return null; }
  });

  useEffect(() => {
    if (native) return onLiveUpdateState(setLive);
    api.getLatestAppVersion().then((v) => { if (v) setLatestVersion(v); });
  }, [native]);

  // Remembers which version was dismissed, not "dismissed forever": the next one shows again.
  const dismiss = (version: string) => {
    try { localStorage.setItem(DISMISS_KEY, version); } catch { /* private mode */ }
    setDismissed(version);
  };

  if (native) {
    if (live.apk && dismissed !== live.apk.version) {
      return (
        <UpdateBanner
          version={live.apk.version}
          onDismiss={() => dismiss(live.apk!.version)}
          text={t('update.apkReady', { version: live.apk.version })}
          action={<a href={live.apk.url} target="_blank" rel="noreferrer" className={ACTION}><Download className="size-4" aria-hidden="true" />{t('update.download')}</a>}
        />
      );
    }
    if (live.readyVersion && dismissed !== live.readyVersion) {
      return (
        <UpdateBanner
          version={live.readyVersion}
          onDismiss={() => dismiss(live.readyVersion!)}
          text={t('update.bundleReady', { version: live.readyVersion })}
          action={<button type="button" onClick={applyUpdateNow} className={ACTION}><RefreshCw className="size-4" aria-hidden="true" />{t('update.restart')}</button>}
        />
      );
    }
    return null;
  }

  if (!latestVersion || !isNewerVersion(latestVersion, APP_VERSION) || dismissed === latestVersion) return null;
  return <UpdateBanner version={latestVersion} onDismiss={() => dismiss(latestVersion)} />;
}
