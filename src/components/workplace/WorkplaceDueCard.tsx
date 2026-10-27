import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { getTodayIST } from '../../utils/timezone';
import { useForegroundInterval } from '../../utils/appVisibility';
import { useT } from '../../utils/i18n';
import { Callout } from '../ui/callout';
import { Button } from '../ui/button';
import { useHomeData } from '../home/homeData';
import type { MyChecks } from './workplaceApi';
import { fmt12, liveStatus, nowMinutesIST, toMin } from './workplaceUtils';

// How long before a window opens Home starts reminding.
const SHOW_BEFORE_MINUTES = 60;

export type WorkplaceDue = {
  /** Today's photo spots for this person (0 = no checks today: no checklist row). */
  total: number;
  sent: number;
  /** Spots still to photograph whose window is open or about to (an hour before). */
  pending: number;
  late: boolean;
  /** Overall state for the checklist row. */
  status: 'due' | 'late' | 'done' | 'later' | null;
  /** Window of the next spot to photograph ("15:00", "16:00"), or of the last one when all are sent. */
  from: string;
  to: string;
  loaded: boolean;
};

/**
 * Today's workplace photos for the signed-in person (GET /workplace/my), re-read every ten minutes
 * and re-judged every minute while the app is in front - the same rules the old Home card used.
 */
export function useWorkplaceDue(): WorkplaceDue {
  const homeData = useHomeData();
  const [data, setData] = useState<MyChecks | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [, setTick] = useState(0);
  const mountedRef = useRef(true);

  const load = useCallback(() => {
    homeData.getMyChecks()
      .then((d) => { if (mountedRef.current) setData(d); })
      .catch(() => { /* offline or older server: no row */ })
      .finally(() => { if (mountedRef.current) setLoaded(true); });
  }, [homeData]);
  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);
  useForegroundInterval(load, 10 * 60000);
  useForegroundInterval(() => setTick((n) => n + 1), 60000, { resumeAfterMs: 0 });

  const empty: WorkplaceDue = { total: 0, sent: 0, pending: 0, late: false, status: null, from: '', to: '', loaded };
  const today = getTodayIST();
  if (!data?.items.length || data.date !== today) return empty;
  const nowMin = nowMinutesIST();
  const items = data.items.filter((i) => i.start);
  const sent = items.filter((i) => i.hasPhoto).length;
  const open = items
    .filter((i) => !i.hasPhoto)
    .map((i) => ({ ...i, status: liveStatus(today, today, nowMin, i.start, i.end, false) }))
    .sort((a, b) => a.end.localeCompare(b.end));
  const pending = open.filter((i) => nowMin >= toMin(i.start) - SHOW_BEFORE_MINUTES);
  const late = pending.filter((i) => i.status === 'late' || i.status === 'missed');
  if (!open.length) {
    const last = [...items].sort((a, b) => a.end.localeCompare(b.end)).pop();
    return { total: items.length, sent, pending: 0, late: false, status: 'done', from: last?.start || '', to: last?.end || '', loaded };
  }
  const next = late[0] || pending[0] || open[0];
  return {
    total: items.length,
    sent,
    pending: pending.length,
    late: late.length > 0,
    status: late.length ? 'late' : pending.length ? 'due' : 'later',
    from: next.start,
    to: next.end,
    loaded,
  };
}

// The old Home card ("Photos due by 4 PM"), now a callout. Home itself shows a checklist row
// built from useWorkplaceDue instead; this stays for any screen that wants the reminder.
export function WorkplaceDueCard({ onOpen }: { onOpen: () => void }) {
  const { t } = useT();
  const due = useWorkplaceDue();
  if (due.status !== 'due' && due.status !== 'late') return null;
  return (
    <Callout
      tone={due.late ? 'danger' : 'warning'}
      icon={Camera}
      title={due.late ? t('workplace.wereDue', { time: fmt12(due.to) }) : t('workplace.dueBy', { time: fmt12(due.to) })}
      action={<Button variant="secondary" size="sm" leadingIcon={<Camera />} onClick={onOpen}>{t('workplace.take')}</Button>}
    >
      {t('workplace.left', { n: due.pending })}
    </Callout>
  );
}
