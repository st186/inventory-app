// Which days of the month have a production entry, and which don't - the production-side
// twin of SettlementCoverage. A day is logged when its production record has pieces or
// sauces in it; a record saved with nothing in it counts as not logged. Dispatches to the
// stores are shown as a hint, since momos sent out on a day with no entry usually means
// the entry was skipped, not that nothing was made. Tapping a day opens it for entry.

import { useMemo } from 'react';
import { AlertCircle, CalendarCheck } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from './ui/utils';
import { useT } from '../utils/i18n';
import { CollapsibleCard } from './stock/stockShared';
import type { ProductionData } from '../App';
import type * as api from '../utils/api';
import { MOMO_TYPES } from '../constants/momoTypes';
import { getTodayIST, addDays } from '../utils/timezone';

type Status = 'logged' | 'pending' | 'empty' | 'missing' | 'today';

const inr = (n: number) => Math.round(n).toLocaleString('en-IN');
const dayNum = (iso: string) => Number(iso.slice(8, 10));
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const CHIP: Record<Status, string> = {
  logged: 'bg-success-soft text-success',
  pending: 'bg-success-soft text-success ring-2 ring-inset ring-warning',
  empty: 'bg-danger-soft text-danger ring-2 ring-inset ring-danger-border',
  missing: 'bg-danger text-on-danger',
  today: 'bg-warning-soft text-warning',
};
const LABEL: Record<Status, string> = {
  logged: 'Logged',
  pending: 'Logged, waiting for approval',
  empty: 'Saved with 0 pieces',
  missing: 'No production entry',
  today: 'Today, not logged yet',
};

const piecesOf = (p: ProductionData) => MOMO_TYPES.reduce((t, m) => t + (Number((p as any)[m.key]?.final) || 0), 0);
const saucesOf = (p: ProductionData) => Object.values(((p as any).sauces || {}) as Record<string, unknown>).reduce<number>((t, v) => t + (Number(v) || 0), 0);

// A request's dispatch day in IST: shippedAt is an ISO instant; older records only have
// deliveredAt, sometimes as "31/12/2025, 00:29:07".
const dispatchDay = (r: api.ProductionRequest): string | null => {
  const raw: string | undefined = (r as any).shippedAt || (r as any).deliveredAt;
  if (!raw) return null;
  const dmy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
};

export function ProductionCoverage({
  productionData, productionRequests, stores, productionHouseId, selectedDate, onPickDate,
}: {
  productionData: ProductionData[];
  productionRequests: api.ProductionRequest[];
  stores: { id: string; productionHouseId?: string | null }[];
  productionHouseId: string;
  selectedDate: string;
  onPickDate: (date: string) => void;
}) {
  const { t, lang } = useT();
  const today = getTodayIST();
  const monthStart = `${selectedDate.slice(0, 7)}-01`;
  const monthEnd = addDays(`${addDays(monthStart, 32).slice(0, 7)}-01`, -1);
  const last = monthEnd > today ? today : monthEnd;

  const cells = useMemo(() => {
    const byDay = new Map<string, ProductionData[]>();
    for (const p of productionData) {
      if (p.productionHouseId !== productionHouseId && p.storeId !== productionHouseId) continue;
      if (p.date < monthStart || p.date > last) continue;
      byDay.set(p.date, [...(byDay.get(p.date) || []), p]);
    }
    const houseStores = new Set(stores.filter((s) => s.productionHouseId === productionHouseId).map((s) => s.id));
    const dispatches = new Map<string, number>();
    for (const r of productionRequests) {
      // Event stall requests (events.ts) name their production house themselves.
      const fromHouse = houseStores.has((r as any).storeId) || (!!(r as any).eventId && (r as any).productionHouseId === productionHouseId);
      if (!fromHouse || !['shipped', 'delivered', 'partially-delivered'].includes((r as any).status)) continue;
      const d = dispatchDay(r);
      if (d && d >= monthStart && d <= last) dispatches.set(d, (dispatches.get(d) || 0) + 1);
    }
    const out: { date: string; status: Status; pieces: number; dispatched: number }[] = [];
    for (let d = monthStart; d <= last; d = addDays(d, 1)) {
      const entries = byDay.get(d) || [];
      const pieces = entries.reduce((t, p) => t + piecesOf(p), 0);
      const hasData = pieces > 0 || entries.some((p) => saucesOf(p) > 0);
      let status: Status;
      if (hasData) status = entries.some((p) => p.approvalStatus === 'pending') ? 'pending' : 'logged';
      else if (d === today) status = 'today';
      else status = entries.length ? 'empty' : 'missing';
      out.push({ date: d, status, pieces, dispatched: dispatches.get(d) || 0 });
    }
    return out;
  }, [productionData, productionRequests, stores, productionHouseId, monthStart, last, today]);

  if (monthStart > last) return null;
  const gaps = cells.filter((c) => c.status === 'missing' || c.status === 'empty');
  const pending = cells.filter((c) => c.status === 'pending').length;
  const loggedDays = cells.filter((c) => c.status === 'logged' || c.status === 'pending');

  return (
    <CollapsibleCard
      defaultOpen={gaps.length > 0}
      icon={<span className={`flex size-9 shrink-0 items-center justify-center rounded-md [&_svg]:size-5 ${gaps.length ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-text-2'}`} aria-hidden="true">{gaps.length ? <AlertCircle /> : <CalendarCheck />}</span>}
      title={t('stock.prod.logCheck')}
      subtitle={`${gaps.length > 0 ? t(gaps.length === 1 ? 'stock.prod.gapsOne' : 'stock.prod.gaps', { n: gaps.length }) : t('stock.prod.noGaps')}${pending > 0 ? ` ${pending} waiting for approval.` : ''}`}
    >
      <div className="flex flex-col gap-3 p-4" lang={lang}>
        <p className="num text-label text-text-3">{t('stock.prod.loggedDays', { logged: loggedDays.length, days: cells.length, pieces: inr(loggedDays.reduce((s, c) => s + c.pieces, 0)) })}</p>
        <ul className="grid grid-cols-7 gap-1" aria-label={t('stock.prod.logCheck')}>
          {cells.map((c) => (
            <li key={c.date}>
              <button
                type="button"
                onClick={() => onPickDate(c.date)}
                title={`${shortDate(c.date)} · ${LABEL[c.status]}${c.pieces > 0 ? ` · ${inr(c.pieces)} pieces` : ''}${c.dispatched ? ' · stock sent to the store' : ''}`}
                aria-label={`${shortDate(c.date)}: ${LABEL[c.status]}`}
                aria-current={c.date === selectedDate ? 'date' : undefined}
                className={cn(
                  'hit-44 num flex h-10 w-full items-center justify-center rounded-md text-label font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  CHIP[c.status],
                  c.date === selectedDate && 'ring-2 ring-text ring-offset-1 ring-offset-surface',
                )}
              >
                {dayNum(c.date)}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-caption text-text-2">
          {(['missing', 'empty', 'today', 'pending', 'logged'] as Status[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5"><span className={cn('size-3 rounded-xs', CHIP[s])} aria-hidden="true" />{LABEL[s]}</span>
          ))}
        </div>
        {gaps.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {gaps.map((c) => (
              <Button key={c.date} variant="secondary" size="sm" onClick={() => onPickDate(c.date)}>
                <span className="font-semibold">{shortDate(c.date)}</span>
                <span className="text-text-2">{c.status === 'empty' ? 'saved with 0 pieces' : 'no entry'}{c.dispatched ? ' · stock was sent' : ''}</span>
              </Button>
            ))}
          </div>
        )}
        <p className="text-caption text-text-3">Production is logged at the end of each working day. "Stock was sent" means momos left for the store that day, so the kitchen was working: check what was made and log it.</p>
      </div>
    </CollapsibleCard>
  );
}
