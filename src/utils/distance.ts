// A distance the way people say it (owner, 28 Oct 2026: "2568 metres away ... has to be 2.5 km"):
// metres to the nearest 10 under a kilometre, then kilometres with one decimal - "350 m", "2.6 km".
// With the app's t() it uses the person's language ("২.৬ কিমি"), without it English.
import type { I18nKey } from './i18n';

export function distanceText(metres: number | null | undefined, t?: (key: I18nKey, vars?: Record<string, string | number>) => string): string {
  if (metres === null || metres === undefined || !Number.isFinite(metres)) return '?';
  const km = metres >= 995;
  const n = km ? (metres / 1000).toFixed(1) : String(Math.round(metres / 10) * 10);
  if (t) return t(km ? 'unit.km' : 'unit.metres', { n });
  return `${n} ${km ? 'km' : 'm'}`;
}
