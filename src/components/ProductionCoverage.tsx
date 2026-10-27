// Which days of the month have a production entry, and which don't - the production-side
// twin of SettlementCoverage. A day is logged when its production record has pieces or
// sauces in it; a record saved with nothing in it counts as not logged. Dispatches to the
// stores are shown as a hint, since momos sent out on a day with no entry usually means
// the entry was skipped, not that nothing was made. Tapping a day opens it for entry.

import { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import type { ProductionData } from '../App';
import type * as api from '../utils/api';
import { MOMO_TYPES } from '../constants/momoTypes';
import { getTodayIST, addDays } from '../utils/timezone';

type Status = 'logged' | 'pending' | 'empty' | 'missing' | 'today';

const inr = (n: number) => Math.round(n).toLocaleString('en-IN');
const dayNum = (iso: string) => Number(iso.slice(8, 10));
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const CHIP: Record<Status, string> = {
  logged: 'bg-emerald-100 text-emerald-800',
  pending: 'bg-emerald-100 text-emerald-800 ring-2 ring-amber-400',
  empty: 'bg-rose-100 text-rose-800 ring-2 ring-rose-300',
  missing: 'bg-rose-600 text-white ring-2 ring-rose-300',
  today: 'bg-amber-100 text-amber-800',
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
    <div className={`bg-white rounded-2xl p-4 sm:p-5 border shadow-sm mb-6 ${gaps.length ? 'border-rose-200' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
            {gaps.length > 0 && <AlertCircle className="w-5 h-5 text-rose-600" />}
            Production log check
          </h3>
          <p className="text-xs sm:text-sm text-gray-500">
            {gaps.length > 0
              ? `${gaps.length} day${gaps.length === 1 ? '' : 's'} in ${new Date(`${monthStart}T00:00:00`).toLocaleDateString('en-IN', { month: 'long' })} with no production logged. Tap a day to open it and fill it in.`
              : 'Every day this month so far has a production entry.'}
            {pending > 0 && ` ${pending} logged day${pending === 1 ? ' is' : 's are'} waiting for approval.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
          {(['missing', 'empty', 'today', 'pending', 'logged'] as Status[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5"><span className={`w-3 h-3 rounded ${CHIP[s]}`} aria-hidden="true" />{LABEL[s]}</span>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-1.5">
        {loggedDays.length} of {cells.length} days logged · {inr(loggedDays.reduce((t, c) => t + c.pieces, 0))} pieces
      </p>
      <ul className="flex flex-wrap gap-1" aria-label="Production entry status by day">
        {cells.map((c) => (
          <li key={c.date}>
            <button
              type="button"
              onClick={() => onPickDate(c.date)}
              className={`inline-flex items-center justify-center w-8 h-8 rounded-md text-xs font-semibold tabular-nums cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-500 ${CHIP[c.status]} ${c.date === selectedDate ? 'outline outline-2 outline-offset-1 outline-gray-900' : ''}`}
              title={`${shortDate(c.date)} · ${LABEL[c.status]}${c.pieces > 0 ? ` · ${inr(c.pieces)} pieces` : ''}${c.dispatched ? ` · stock sent to the store` : ''}`}
              aria-label={`${shortDate(c.date)}: ${LABEL[c.status]}`}
            >
              {dayNum(c.date)}
            </button>
          </li>
        ))}
      </ul>
      {gaps.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {gaps.map((c) => (
            <button
              key={c.date}
              type="button"
              onClick={() => onPickDate(c.date)}
              className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs text-rose-800 cursor-pointer hover:bg-rose-100"
            >
              <span className="font-semibold">{shortDate(c.date)}</span>
              <span>{c.status === 'empty' ? 'saved with 0 pieces' : 'no entry'}{c.dispatched ? ' · stock was sent' : ''}</span>
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-gray-500">
        Production is logged at the end of each working day. "Stock was sent" means momos left for the store that day, so the kitchen was working: check what was made and log it.
      </p>
    </div>
  );
}
