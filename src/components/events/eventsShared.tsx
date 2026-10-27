// Small pieces the event screens share: the API hand-off (real or the dev preview's mock), the
// status chip, date and momo labels.
import * as React from 'react';
import { CalendarClock, CheckCircle2, CircleDot, Lock } from 'lucide-react';
import { StatusChip } from '../ui/status-chip';
import { eventsApi, type EventsApi } from '../../utils/eventsApi';
import { EVENT_MOMO_KEYS, EVENT_MOMO_LABELS, type EventMomoKey, type EventStatus } from '../../utils/eventRules';
import { useT, type Lang } from '../../utils/i18n';

const EventsApiContext = React.createContext<EventsApi>(eventsApi);
export const EventsApiProvider = EventsApiContext.Provider;
export const useEventsApi = () => React.useContext(EventsApiContext);

// "Today" for the event screens (the preview pins it so its mock data reads the same any day).
const TodayContext = React.createContext<string | null>(null);
export const EventsTodayProvider = TodayContext.Provider;
export function useEventsToday(serverToday?: string): string {
  const pinned = React.useContext(TodayContext);
  return pinned || serverToday || new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

export function EventStatusChip({ status, size }: { status: EventStatus; size?: 'md' | 'sm' }) {
  const { t } = useT();
  if (status === 'live') return <StatusChip tone="success" icon={CircleDot} size={size}>{t('event.status.live')}</StatusChip>;
  if (status === 'planned') return <StatusChip tone="info" icon={CalendarClock} size={size}>{t('event.status.planned')}</StatusChip>;
  if (status === 'ended') return <StatusChip tone="warning" icon={CheckCircle2} size={size}>{t('event.status.ended')}</StatusChip>;
  return <StatusChip tone="neutral" icon={Lock} size={size}>{t('event.status.closed')}</StatusChip>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BN_MONTHS = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const bnNum = (s: string) => s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]);

// A count in the person's script (Bengali digits for Bengali).
export const localNum = (n: number, lang: Lang) => (lang === 'bn' ? bnNum(String(n)) : String(n));

export function shortDate(date: string, lang: Lang = 'en'): string {
  if (!date) return '';
  const [, m, d] = date.split('-').map(Number);
  return lang === 'bn' ? `${bnNum(String(d))} ${BN_MONTHS[m - 1]}` : `${d} ${MONTHS[m - 1]}`;
}
export function dateRange(from: string, to: string, lang: Lang = 'en'): string {
  return from === to ? shortDate(from, lang) : `${shortDate(from, lang)} – ${shortDate(to, lang)}`;
}
export function weekday(date: string): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${date}T00:00:00Z`).getUTCDay()];
}
export function dayNumber(startDate: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
}

export function momoLabel(key: EventMomoKey, lang: Lang): string {
  return lang === 'bn' ? EVENT_MOMO_LABELS[key].bn : EVENT_MOMO_LABELS[key].en;
}
export const MOMO_KEYS = EVENT_MOMO_KEYS;

export const EXPENSE_CATEGORIES = ['rent', 'electricity', 'purchase', 'transport', 'staff', 'marketing', 'overhead', 'other'] as const;

// A loader for one async value with retry, used by every tab.
export function useLoad<T>(load: () => Promise<T>, deps: React.DependencyList) {
  const [state, setState] = React.useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const run = React.useCallback(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load().then(
      (data) => { if (alive) setState({ data, error: null, loading: false }); },
      (e) => { if (alive) setState((s) => ({ ...s, error: e?.message || 'Could not load', loading: false })); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  React.useEffect(() => run(), [run]);
  return { ...state, reload: run };
}
