import { useMemo, type ReactNode } from 'react';
import { X, Percent, Landmark } from 'lucide-react';
import type { AggregatorSettlement, OnlineLoan } from '../utils/api';
import { settlementShareInRange, type OnlineCosts } from '../utils/onlineCosts';
import { getTodayIST } from '../utils/timezone';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const inr2 = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function Shell({ title, subtitle, icon, onClose, children }: { title: string; subtitle: string; icon: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-orange-600 via-rose-500 to-orange-600 text-white p-6 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center border border-white/30 flex-shrink-0">{icon}</div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h2>
              <p className="text-orange-100 mt-1 text-sm">{subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors flex-shrink-0" aria-label="Close">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 sm:p-6 space-y-6">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Commission

// Commission shown without the GST the platform collects from the customer and pays on our
// behalf - same rule as utils/onlineCosts.ts.
const gstOf = (s: AggregatorSettlement) => s.gstCollected ?? ((s.grossSales || 0) * 5) / 105;
const commissionExGst = (s: AggregatorSettlement) => (s.netCommission || 0) - gstOf(s);

export function CommissionBreakdownModal({
  totalAmount, settlements, costs, range, periodLabel, onClose,
}: {
  totalAmount: number; // commission + ads
  settlements: AggregatorSettlement[];
  // The headline split: settled, old manual payout entries, and estimates for days the
  // platforms haven't settled yet (see utils/onlineCosts.ts).
  costs: OnlineCosts;
  // The period the headline covers (null = no limit).
  range: { start: string; end: string } | null;
  periodLabel: string;
  onClose: () => void;
}) {
  const perAggregator = useMemo(() => {
    // Each settlement counts only for its days inside the period (up to today), split by order
    // value - the same per-day share the card uses - so a settlement straddling the period's
    // edge isn't counted whole and these figures add up to "Commission from settlement files".
    const today = getTodayIST();
    const last = range ? (range.end > today ? today : range.end) : null;
    const shareOf = (s: AggregatorSettlement) => (range && last ? settlementShareInRange(s, range.start, last) : 1);
    const ordersIn = (s: AggregatorSettlement, share: number) => {
      const dated = (s.orders || []).filter((o) => o.orderDate);
      if (!range || !last || dated.length === 0) return Math.round((s.orderCount || 0) * share);
      return dated.filter((o) => o.orderDate! >= range.start && o.orderDate! <= last).length;
    };
    return (['zomato', 'swiggy'] as const).map((agg) => {
      const rows = settlements
        .filter((s) => s.aggregator === agg)
        .map((s) => ({ s, share: shareOf(s) }))
        .filter((r) => r.share > 0);
      const sum = (pick: (s: AggregatorSettlement) => number) => rows.reduce((t, r) => t + pick(r.s) * r.share, 0);
      const gross = sum((r) => (r.grossSales || 0) - gstOf(r));
      const commission = sum(commissionExGst);
      return {
        agg, count: rows.length, gross, commission,
        adSpend: sum((r) => r.adSpend || 0),
        net: sum((r) => r.netPayout || 0),
        orders: rows.reduce((t, r) => t + ordersIn(r.s, r.share), 0),
        pct: gross > 0 ? (commission / gross) * 100 : null,
      };
    });
  }, [settlements, range]);

  const sorted = useMemo(
    () => [...settlements].sort((a, b) => ((a.periodEnd || a.settlementDate) < (b.periodEnd || b.settlementDate) ? 1 : -1)),
    [settlements]
  );

  return (
    <Shell
      title="Zomato & Swiggy Commission and Ads"
      subtitle={`${periodLabel} • Total ${inr(totalAmount)} • ${settlements.length} settlement${settlements.length === 1 ? '' : 's'}`}
      icon={<Percent className="w-6 h-6 text-white" />}
      onClose={onClose}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {perAggregator.map((a) => (
          <div key={a.agg} className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-900 capitalize">{a.agg}</p>
              <span className="text-xs text-gray-500">{a.count} settlement{a.count === 1 ? '' : 's'} • {a.orders} orders</span>
            </div>
            {a.count === 0 ? (
              <p className="text-sm text-gray-400 mt-3">No settlement uploaded for this period.</p>
            ) : (
              <>
                <p className="text-2xl font-bold text-gray-900 tabular-nums mt-2">{inr(a.commission)}
                  {a.pct !== null && <span className="ml-2 text-sm font-semibold text-rose-600">{a.pct.toFixed(1)}% of order value</span>}
                </p>
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <div><p className="text-gray-500">Order value</p><p className="font-semibold tabular-nums">{inr(a.gross)}</p></div>
                  <div><p className="text-gray-500">Ad spend</p><p className="font-semibold tabular-nums">{inr(a.adSpend)}</p></div>
                  <div><p className="text-gray-500">Net payout</p><p className="font-semibold tabular-nums">{inr(a.net)}</p></div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 text-sm">
        {[
          { label: 'Commission from settlement files', value: costs.settledCommission },
          { label: 'Commission from old manual payout entries', value: costs.legacyCommission },
          {
            label: `Estimated commission for ${costs.estimatedDays} day${costs.estimatedDays === 1 ? '' : 's'} not settled yet`,
            value: costs.estimatedCommission,
            note: `At the last 60 days' rate: Zomato ${(costs.rates.zomato.commission * 100).toFixed(1)}%, Swiggy ${(costs.rates.swiggy.commission * 100).toFixed(1)}% of sales. Replaced by the real figure once the settlement is uploaded.`,
          },
          { label: 'Platform ads', value: costs.ads, note: costs.estimatedAds > 0.5 ? `incl. ${inr(costs.estimatedAds)} estimated` : undefined },
        ].filter((row) => Math.abs(row.value) > 0.5).map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4 px-4 py-3">
            <div>
              <p className="text-gray-800">{row.label}</p>
              {row.note && <p className="text-xs text-gray-500 mt-0.5">{row.note}</p>}
            </div>
            <p className="font-semibold tabular-nums text-gray-900">{inr(row.value)}</p>
          </div>
        ))}
        {costs.gstExcluded > 0.5 && (
          <p className="px-4 py-3 text-xs text-gray-500">
            Not counted: {inr(costs.gstExcluded)} GST the platforms collected from customers and paid to the government for us. It was never part of our revenue, so it isn't our cost.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">Settlements in this period</h3>
          <p className="text-xs text-gray-500">Counted by the orders' dates, not the day the money arrived - a settlement paid in October for September orders belongs to September. A settlement that runs past the period's edge only counts for its days inside it.</p>
        </div>
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-500 p-5 text-center">No settlements cover this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2">Aggregator</th>
                  <th className="px-4 py-2">Orders from</th>
                  <th className="px-4 py-2">Paid on</th>
                  <th className="px-4 py-2 text-right">Order value</th>
                  <th className="px-4 py-2 text-right">Commission</th>
                  <th className="px-4 py-2 text-right">%</th>
                  <th className="px-4 py-2 text-right">Ad spend</th>
                  <th className="px-4 py-2 text-right">Net payout</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 capitalize font-medium text-gray-900">{s.aggregator}</td>
                    <td className="px-4 py-2 text-gray-600">{shortDate(s.periodStart || s.settlementDate)} - {shortDate(s.periodEnd || s.settlementDate)}</td>
                    <td className="px-4 py-2 text-gray-600">{shortDate(s.settlementDate)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{inr2((s.grossSales || 0) - gstOf(s))}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">{inr2(commissionExGst(s))}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-rose-600">{s.grossSales - gstOf(s) > 0 ? ((commissionExGst(s) / (s.grossSales - gstOf(s))) * 100).toFixed(1) : '-'}%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.adSpend ? inr2(s.adSpend) : '-'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{inr2(s.netPayout || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------------ Interest

// Same accrual rule as Analytics' calculateAccruedInterest: monthly interest of
// principal x rate x days / (100 x 30), over the days a loan overlaps the period, stopping
// at repayment for repaid loans.
function accrue(loan: OnlineLoan, start: string, end: string): { days: number; interest: number } {
  const loanDate = new Date(loan.loanDate);
  const periodStart = new Date(start);
  const periodEnd = new Date(end);
  const loanEnd = loan.status === 'repaid' && loan.repaymentDate ? new Date(loan.repaymentDate) : periodEnd;
  const overlapStart = loanDate > periodStart ? loanDate : periodStart;
  const overlapEnd = loanEnd < periodEnd ? loanEnd : periodEnd;
  if (!(overlapStart < overlapEnd)) return { days: 0, interest: 0 };
  const days = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1;
  return { days, interest: Math.max(0, ((loan.loanAmount || 0) * (loan.interestRate || 0) * days) / (100 * 30)) };
}

export function InterestBreakdownModal({
  totalAmount, loans, range, periodLabel, onClose,
}: {
  totalAmount: number;
  loans: OnlineLoan[];
  range: { start: string; end: string } | null;
  periodLabel: string;
  onClose: () => void;
}) {
  const rows = useMemo(() => {
    if (!range) return [];
    return loans
      .filter((l) => l.interestRate && l.interestRate > 0)
      .map((l) => ({ loan: l, ...accrue(l, range.start, range.end) }))
      .filter((r) => r.interest > 0)
      .sort((a, b) => b.interest - a.interest);
  }, [loans, range]);

  return (
    <Shell
      title="Loan Interest Breakdown"
      subtitle={`${periodLabel} • Total ${inr(totalAmount)} • ${rows.length} loan${rows.length === 1 ? '' : 's'} accruing interest`}
      icon={<Landmark className="w-6 h-6 text-white" />}
      onClose={onClose}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 p-5 text-center">No interest-bearing loans accrue in this period.</p>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2">Lender</th>
                  <th className="px-4 py-2">Taken on</th>
                  <th className="px-4 py-2 text-right">Principal</th>
                  <th className="px-4 py-2 text-right">Rate / month</th>
                  <th className="px-4 py-2 text-right">Days in period</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Interest</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ loan, days, interest }) => (
                  <tr key={loan.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{loan.investorName || 'Unknown lender'}</td>
                    <td className="px-4 py-2 text-gray-600">{shortDate(loan.loanDate)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{inr(loan.loanAmount)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{loan.interestRate}%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{days}</td>
                    <td className="px-4 py-2 capitalize text-gray-600">{loan.status}{loan.status === 'repaid' && loan.repaymentDate ? ` (${shortDate(loan.repaymentDate)})` : ''}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">{inr2(interest)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-xs text-gray-500">Interest accrues daily at principal × monthly rate × days ÷ 30, from the day the loan was taken until it is repaid (or the end of the period).</p>
    </Shell>
  );
}
