// Which days in the selected range have a Zomato/Swiggy settlement, and which don't. A day is
// covered when an uploaded settlement includes orders from that date (the same rule
// utils/onlineCosts.ts uses for profit, so a red day here is a day whose commission is being
// estimated), or when an old manual payout entry exists for it. A day is only missing once
// its payout date has passed (utils/payoutSchedule.ts); before that it is "not due yet".

import { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { buildOnlineCostIndex, type Aggregator } from '../utils/onlineCosts';
import { getTodayIST, addDays } from '../utils/timezone';
import { payoutDateFor, settlementDueBy } from '../utils/payoutSchedule';

type Status = 'settled' | 'missing' | 'awaiting' | 'none';

const NAME: Record<Aggregator, string> = { zomato: 'Zomato', swiggy: 'Swiggy' };

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const dayNum = (iso: string) => Number(iso.slice(8, 10));
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const dayDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
// "21-23 Oct", or "30 Sep-2 Oct" across a month end, from a sorted list of dates.
const dateSpan = (dates: string[]) => {
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === last) return shortDate(first);
  return first.slice(0, 7) === last.slice(0, 7) ? `${dayNum(first)}-${shortDate(last)}` : `${shortDate(first)}-${shortDate(last)}`;
};
const monthName = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { month: 'short' });

const CHIP: Record<Status, string> = {
  settled: 'bg-emerald-100 text-emerald-800',
  missing: 'bg-rose-600 text-white ring-2 ring-rose-300',
  awaiting: 'bg-amber-100 text-amber-800',
  none: 'bg-gray-100 text-gray-400',
};
const LABEL: Record<Status, string> = { settled: 'Settled', missing: 'Settlement missing', awaiting: 'Not due yet', none: 'No online orders' };

export function SettlementCoverage({
  settlements, onlineSales, onlinePayouts, start, end,
}: {
  settlements: any[];
  onlineSales: any[];
  onlinePayouts: any[];
  start: string;
  end: string;
}) {
  const today = getTodayIST();
  const last = end > today ? today : end;

  const rows = useMemo(() => {
    const index = buildOnlineCostIndex(settlements, null);
    const sales = new Map<string, Record<Aggregator, number>>();
    for (const s of onlineSales) {
      if (!s?.date || s.date < start || s.date > last) continue;
      const d = sales.get(s.date) || { zomato: 0, swiggy: 0 };
      d.zomato += s.zomatoSales || 0;
      d.swiggy += s.swiggySales || 0;
      sales.set(s.date, d);
    }
    const manual = new Map<string, Record<Aggregator, number>>();
    for (const p of onlinePayouts) {
      if (!p?.date || p.date < start || p.date > last) continue;
      const d = manual.get(p.date) || { zomato: 0, swiggy: 0 };
      d.zomato += p.zomatoPayout || 0;
      d.swiggy += p.swiggyPayout || 0;
      manual.set(p.date, d);
    }
    const days: string[] = [];
    for (let d = start; d <= last; d = addDays(d, 1)) days.push(d);

    return (['zomato', 'swiggy'] as Aggregator[]).map((agg) => {
      const cells = days.map((date) => {
        const amount = sales.get(date)?.[agg] || 0;
        const payout = payoutDateFor(agg, date);
        let status: Status;
        if (index.covered[agg].has(date) || (manual.get(date)?.[agg] || 0) > 0) status = 'settled';
        else if (amount <= 0) status = 'none';
        else if (today <= settlementDueBy(agg, date)) status = 'awaiting';
        else status = 'missing';
        return { date, amount, status, payout };
      });
      const missing = cells.filter((c) => c.status === 'missing');
      // Payouts still to come, one row per payout date with the order days it pays for.
      const upcoming = new Map<string, { dates: string[]; amount: number }>();
      cells.filter((c) => c.status === 'awaiting').forEach((c) => {
        const u = upcoming.get(c.payout) || { dates: [], amount: 0 };
        u.dates.push(c.date);
        u.amount += c.amount;
        upcoming.set(c.payout, u);
      });
      return {
        agg,
        cells,
        missing,
        upcoming: [...upcoming.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([payout, u]) => ({ payout, ...u })),
        missingAmount: missing.reduce((t, c) => t + c.amount, 0),
        settledDays: cells.filter((c) => c.status === 'settled').length,
        awaitingDays: cells.filter((c) => c.status === 'awaiting').length,
        salesDays: cells.filter((c) => c.status !== 'none').length,
      };
    });
  }, [settlements, onlineSales, onlinePayouts, start, last, today]);

  if (start > last) return null;
  const totalMissing = rows.reduce((t, r) => t + r.missing.length, 0);

  return (
    <div className={`bg-white rounded-2xl p-4 sm:p-5 border shadow-sm ${totalMissing ? 'border-rose-200' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
            {totalMissing > 0 && <AlertCircle className="w-5 h-5 text-rose-600" />}
            Settlement check
          </h3>
          <p className="text-xs sm:text-sm text-gray-500">
            {totalMissing > 0
              ? `${totalMissing} day${totalMissing === 1 ? '' : 's'} with online orders but no settlement uploaded. Download those settlement reports from Zomato or Swiggy and upload them here.`
              : 'Every day with online orders in this range has a settlement, apart from days not due yet.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
          {(['missing', 'awaiting', 'settled', 'none'] as Status[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5"><span className={`w-3 h-3 rounded ${CHIP[s]}`} aria-hidden="true" />{LABEL[s]}</span>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.agg}>
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
              <p className={`text-sm font-semibold ${r.agg === 'zomato' ? 'text-red-700' : 'text-orange-700'}`}>{NAME[r.agg]}</p>
              <p className="text-xs text-gray-500">
                {r.settledDays} of {r.salesDays} order days settled
                {r.missing.length > 0 && <span className="font-semibold text-rose-700"> · {r.missing.length} missing ({inr(r.missingAmount)} of orders)</span>}
                {r.awaitingDays > 0 && <span> · {r.awaitingDays} not due yet</span>}
              </p>
            </div>
            <ul className="flex flex-wrap gap-1" aria-label={`${NAME[r.agg]} settlement status by day`}>
              {r.cells.map((c, i) => (
                <li key={c.date} className="flex items-center gap-1">
                  {(i === 0 || dayNum(c.date) === 1) && <span className="text-[10px] font-semibold uppercase text-gray-400 pr-0.5">{monthName(c.date)}</span>}
                  <span
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-md text-xs font-semibold tabular-nums ${CHIP[c.status]}`}
                    title={`${shortDate(c.date)} · ${LABEL[c.status]}${c.amount > 0 ? ` · ${inr(c.amount)} of ${NAME[r.agg]} orders` : ''}${c.status === 'awaiting' || c.status === 'missing' ? ` · payout ${c.status === 'missing' ? 'was ' : ''}due ${dayDate(c.payout)}` : ''}`}
                  >
                    {dayNum(c.date)}
                  </span>
                </li>
              ))}
            </ul>
            {r.missing.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.missing.map((c) => (
                  <span key={c.date} className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs text-rose-800">
                    <span className="font-semibold">{shortDate(c.date)}</span>
                    <span className="tabular-nums">{inr(c.amount)}</span>
                    <span className="text-rose-600">· was due {shortDate(c.payout)}</span>
                  </span>
                ))}
              </div>
            )}
            {r.upcoming.length > 0 && (
              <ul className="mt-2 space-y-1" aria-label={`${NAME[r.agg]} payouts still to come`}>
                {r.upcoming.map((u) => (
                  <li key={u.payout} className="flex items-baseline justify-between gap-3 text-xs text-amber-900 bg-amber-50 rounded-lg px-2.5 py-1.5">
                    <span><span className="font-semibold">{dayDate(u.payout)}</span>{r.agg === 'swiggy' && ' (in bank next day)'} · for {dateSpan(u.dates)} orders</span>
                    <span className="tabular-nums font-semibold">{inr(u.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-gray-500">
        Order amounts come from the POS (before commission). Zomato pays 3 days after the orders, Monday to Friday only, so Wednesday to Friday orders are paid the next Monday. Swiggy pays every Tuesday for the Sunday to Saturday week before (in the bank on Wednesday), and pays a month's last days separately 3 days after the month ends. A day turns red when its settlement still isn't uploaded the day after its payout. Until then its commission is estimated in profit.
      </p>
    </div>
  );
}
