// Bump this string every time a new build (web or Android APK) actually ships, together
// with LATEST_APP_VERSION in supabase/functions/make-server-c2dd9b9d/index.ts (GET
// /app-version) - the two are compared to power the soft "update available" banner
// (see UpdateAvailableBanner.tsx). Plain dot-separated integers, compared numerically
// segment-by-segment - keep it to that shape, no pre-release suffixes.
export const APP_VERSION = '1.16.0';
