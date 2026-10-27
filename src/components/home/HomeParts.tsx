// Small pieces every Home screen uses: the page frame, the clock, opening another screen through
// the shell, and date / time words in the person's language.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { cn } from '../ui/utils';
import { useT, type I18nKey } from '../../utils/i18n';
import { getNowIST, getTodayIST } from '../../utils/timezone';
import { useForegroundInterval } from '../../utils/appVisibility';
import { useShell } from '../shell/ShellContext';

/** The column every Home screen sits in: one column on phones, wider from 1024 px. */
export function HomePage({ wide = false, className, children }: { wide?: boolean; className?: string; children?: ReactNode }) {
  const { lang } = useT();
  return (
    <div
      lang={lang}
      className={cn(
        'mx-auto flex w-full flex-col gap-6 px-4 pt-4 pb-6 sm:px-6 lg:px-8 lg:pt-6',
        wide ? 'max-w-[720px] lg:max-w-[1200px]' : 'max-w-[720px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** IST minutes since midnight and today's date, refreshed every minute while the app is open. */
export function useClock() {
  const read = () => {
    const iso = getNowIST();
    return { today: getTodayIST(), minutes: Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) };
  };
  const [now, setNow] = useState(read);
  useForegroundInterval(() => setNow(read()), 60000, { resumeAfterMs: 0 });
  return now;
}

/** Opens a destination if this login has it: tabs switch (fresh stack), other pages open on top. */
export function useOpen() {
  const { nav, router } = useShell();
  const has = useCallback((path: string) => !!nav.destinations[path], [nav]);
  const open = useCallback((path: string, params?: Record<string, string>) => {
    if (!nav.destinations[path]) return;
    const inTab = nav.tabs.some((tab) => tab.path === path || tab.subs.includes(path));
    if (inTab) router.go(path, params);
    else router.push(path, params);
  }, [nav, router]);
  return { open, has };
}

/** Picks the first destination this login has (e.g. 'team/checks' for managers, 'my-checks' for crew). */
export function useFirstPath(...paths: string[]): string | null {
  const { nav } = useShell();
  return paths.find((p) => !!nav.destinations[p]) ?? null;
}

/** "6:40 pm" for a timestamp, in IST. */
export function timeOf(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms + 330 * 60000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}

/** "3:00 pm" for "15:00". */
export function clockOf(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3, 5) || '00';
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'pm' : 'am'}`;
}

/** IST minutes since midnight of a timestamp. */
export function istMinutes(iso: string): number {
  const d = new Date(Date.parse(iso) + 330 * 60000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export const toMinutes = (hhmm: string | null | undefined) => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : 0);

/** Date words in the person's language: "Fri", "Fri 27 Oct", "October". */
export function useDateWords() {
  const { t } = useT();
  const parts = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return { weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), month: m - 1, day: d };
  };
  return {
    weekday: (iso: string) => t(`date.wd.${parts(iso).weekday}` as I18nKey),
    short: (iso: string) => {
      const p = parts(iso);
      return `${t(`date.wd.${p.weekday}` as I18nKey)} ${p.day} ${t(`date.ms.${p.month}` as I18nKey)}`;
    },
    dayMonth: (iso: string) => {
      const p = parts(iso);
      return `${p.day} ${t(`date.ms.${p.month}` as I18nKey)}`;
    },
    month: (iso: string) => t(`date.m.${parts(iso).month}` as I18nKey),
    monthShort: (iso: string) => t(`date.ms.${parts(iso).month}` as I18nKey),
  };
}

/** Runs `load` once on mount and whenever `deps` change; keeps the latest result, loading and error. */
export function useLoad<T>(load: (() => Promise<T>) | null, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: !!load, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!load) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    load()
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch((e: any) => { if (!cancelled) setState((s) => ({ ...s, loading: false, error: e?.message || 'Could not load' })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
