// Over-the-air updates for the Android app (owner, 28 Oct 2026: staff should get new versions
// without being sent an APK). GET /app-version says what the latest is (`updates`, written by
// scripts/publish-update.mjs); the files are in the public app-updates storage folder:
// - bundle: new screens and code. Downloaded in the background and switched to the next time
//   the app goes to the background or is opened again (Capgo's updater, self-hosted: nothing
//   goes to Capgo's servers). A bundle that fails to start is rolled back by the updater and
//   not tried again.
// - apk: a new Android app, for the rare change a bundle can't carry (a new phone permission
//   or plugin). The update banner offers the download and Android asks to install it.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { APP_VERSION, isNewerVersion } from './appVersion';
import { projectId } from './supabase/info';

const APP_VERSION_URL = `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/app-version`;
const FAILED_KEY = 'live-update-failed-versions';
const CHECK_EVERY_MS = 30 * 60 * 1000;

export type UpdateManifest = {
  /** Screens and code; needs at least minNativeBuild (the APK's versionCode) on the phone. */
  bundle?: { version: string; url: string; checksum?: string; minNativeBuild?: number };
  /** The latest Android app. */
  apk?: { version: string; build: number; url: string };
};

export type LiveUpdateState = {
  /** A newer APK to download, when this phone's app is older. */
  apk: { version: string; url: string } | null;
  /** A downloaded bundle that switches in on the next open. */
  readyVersion: string | null;
};

let state: LiveUpdateState = { apk: null, readyVersion: null };
const listeners = new Set<(s: LiveUpdateState) => void>();
let lastCheck = 0;
let checking = false;

function update(patch: Partial<LiveUpdateState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

export function getLiveUpdateState(): LiveUpdateState {
  return state;
}

export function onLiveUpdateState(fn: (s: LiveUpdateState) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export const liveUpdatesOn = () => Capacitor.isNativePlatform();

function failedVersions(): string[] {
  try { return JSON.parse(localStorage.getItem(FAILED_KEY) || '[]'); } catch { return []; }
}

function rememberFailed(version: string) {
  try { localStorage.setItem(FAILED_KEY, JSON.stringify([...new Set([...failedVersions(), version])].slice(-10))); } catch { /* private mode */ }
}

/** Call once, first thing at start-up. Does nothing in a browser. */
export function startLiveUpdates(): void {
  if (!liveUpdatesOn()) return;
  // First: tells the updater this bundle started. One that never says so is rolled back.
  void CapacitorUpdater.notifyAppReady();
  void CapacitorUpdater.addListener('updateFailed', ({ bundle }) => rememberFailed(bundle.version));
  void CapacitorUpdater.addListener('downloadFailed', ({ version }) => rememberFailed(version));
  void check();
  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive && Date.now() - lastCheck > CHECK_EVERY_MS) void check();
  });
}

async function check(): Promise<void> {
  if (checking) return;
  checking = true;
  lastCheck = Date.now();
  try {
    const res = await fetch(`${APP_VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const manifest = ((await res.json()).updates || {}) as UpdateManifest;
    const build = Number((await App.getInfo()).build) || 0;
    update({ apk: manifest.apk && manifest.apk.build > build ? { version: manifest.apk.version, url: manifest.apk.url } : null });

    const bundle = manifest.bundle;
    if (!bundle || !isNewerVersion(bundle.version, APP_VERSION)) return;
    if (build < (bundle.minNativeBuild || 0) || failedVersions().includes(bundle.version)) return;
    const { bundles } = await CapacitorUpdater.list();
    const existing = bundles.find((b) => b.version === bundle.version);
    if (existing?.status === 'downloading') return;
    if (existing?.status === 'error') { rememberFailed(bundle.version); return; }
    const ready = existing && existing.status !== 'deleted' && existing.status !== 'deleting'
      ? existing
      : await CapacitorUpdater.download({ url: bundle.url, version: bundle.version, checksum: bundle.checksum });
    await CapacitorUpdater.next({ id: ready.id });
    update({ readyVersion: bundle.version });
  } catch (error) {
    console.warn('Live update check failed:', error);
  } finally {
    checking = false;
  }
}

/** Switch to the downloaded update now (reloads the app). */
export function applyUpdateNow(): void {
  void CapacitorUpdater.reload();
}
