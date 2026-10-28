// Bump this string every time a new build ships. Plain dot-separated integers, compared
// numerically segment-by-segment - keep it to that shape, no pre-release suffixes.
//
// - A new APK (android/app/build.gradle versionName/versionCode bumped too): also bump
//   LATEST_APP_VERSION in supabase/functions/make-server-c2dd9b9d/index.ts (GET /app-version),
//   which tells apps from before live updates (1.16.2 and older) to get the new APK, then
//   `node scripts/publish-update.mjs apk`.
// - A live update (screens and code only; build.gradle unchanged): bump this alone, build, and
//   `node scripts/publish-update.mjs bundle` (see utils/liveUpdate.ts).
export const APP_VERSION = '1.18.3';

/** True when `latest` is a later version than `current` ("1.10.0" > "1.9.0"). */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = latest.split('.').map((n) => parseInt(n, 10) || 0);
  const b = current.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}
