import { useMemo, type ReactNode } from 'react';
import { Landmark } from 'lucide-react';
import { EmptyState } from './ui/empty-state';
import { ListGroup, ListRow } from './ui/list-row';
import { ResponsiveModal } from './ui/responsive-modal';
import { StatSplit, StatTile } from './ui/stat-tile';
import { StatusChip } from './ui/status-chip';
import { TextRow } from './insights/parts/common';
import type { AggregatorSettlement, OnlineLoan } from '../utils/api';
import { settlementShareInRange, type OnlineCosts } from '../utils/onlineCosts';
import { getTodayIST } from '../utils/timezone';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const inr2 = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

// A sheet on phones, a dialog on desktop (ui/responsive-modal).
function Shell({ title, subtitle, onClose, children }: { title: string; subtitle: string; icon?: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <ResponsiveModal open onOpenChange={(o) => { if (!o) onClose(); }} title={title} description={subtitle} size="detail" bodyClassName="flex flex-col gap-6">
      {children}
    </ResponsiveModal>
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
  const pctOf = (s: AggregatorSettlement) => (s.grossSales - gstOf(s) > 0 ? ((commissionExGst(s) / (s.grossSales - gstOf(s))) * 100).toFixed(1) : '-');
  const lines = [
    { label: 'Commission from settlement files', value: costs.settledCommission },
    { label: 'Commission from old manual payout entries', value: costs.legacyCommission },
    {
      label: `Estimated commission for ${costs.estimatedDays} day${costs.estimatedDays === 1 ? '' : 's'} not settled yet`,
      value: costs.estimatedCommission,
      note: `At the last 60 days' rate: Zomato ${(costs.rates.zomato.commission * 100).toFixed(1)}%, Swiggy ${(costs.rates.swiggy.commission * 100).toFixed(1)}% of sales. Replaced by the real figure once the settlement is uploaded.`,
    },
    { label: 'Platform ads', value: costs.ads, note: costs.estimatedAds > 0.5 ? `incl. ${inr(costs.estimatedAds)} estimated` : undefined },
  ].filter((row) => Math.abs(row.value) > 0.5);

  return (
    <Shell
      title="Zomato & Swiggy commission and ads"
      subtitle={`${periodLabel} • Total ${inr(totalAmount)} • ${settlements.length} settlement${settlements.length === 1 ? '' : 's'}`}
      onClose={onClose}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {perAggregator.map((a) => (
          <StatTile
            key={a.agg}
            label={<span className="capitalize">{a.agg}</span>}
            headerChip={<span className="num text-caption text-text-3">{a.count} settlement{a.count === 1 ? '' : 's'} • {a.orders} orders</span>}
            value={a.count === 0 ? <span className="text-body-md font-normal text-text-3">No settlement uploaded for this period</span> : inr(a.commission)}
            chip={a.count > 0 && a.pct !== null ? <StatusChip tone="neutral">{a.pct.toFixed(1)}% of order value</StatusChip> : undefined}
          >
            {a.count > 0 && (
              <StatSplit
                items={[
                  { label: 'Order value', value: inr(a.gross) },
                  { label: 'Ad spend', value: inr(a.adSpend) },
                  { label: 'Net payout', value: inr(a.net) },
                ]}
              />
            )}
          </StatTile>
        ))}
      </div>

      {(lines.length > 0 || costs.gstExcluded > 0.5) && (
        <ListGroup
          title="What the total is made of"
          footer={costs.gstExcluded > 0.5
            ? `Not counted: ${inr(costs.gstExcluded)} GST the platforms collected from customers and paid to the government for us. It was never part of our revenue, so it isn't our cost.`
            : undefined}
        >
          {lines.map((row) => (
            <ListRow key={row.label} density="compact" title={row.label} subtitle={row.note} trailing={<span className="num text-body-md font-semibold text-text">{inr(row.value)}</span>} />
          ))}
        </ListGroup>
      )}

      <ListGroup
        title="Settlements in this period"
        footer="Counted by the orders' dates, not the day the money arrived - a settlement paid in October for September orders belongs to September. A settlement that runs past the period's edge only counts for its days inside it."
        empty={<EmptyState compact title="No settlements cover this period" />}
      >
        {sorted.map((s) => (
          <TextRow
            key={s.id}
            title={<span className="capitalize">{s.aggregator} · {shortDate(s.periodStart || s.settlementDate)} - {shortDate(s.periodEnd || s.settlementDate)}</span>}
            lines={[
              `Paid ${shortDate(s.settlementDate)} · order value ${inr2((s.grossSales || 0) - gstOf(s))}`,
              `Ad spend ${s.adSpend ? inr2(s.adSpend) : '-'} · net payout ${inr2(s.netPayout || 0)}`,
            ]}
            trailing={
              <>
                <span className="num text-body-md font-semibold text-text">{inr2(commissionExGst(s))}</span>
                <span className="num text-caption text-text-3">{pctOf(s)}%</span>
              </>
            }
          />
        ))}
      </ListGroup>
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
  const statusText = (loan: OnlineLoan) => `${loan.status}${loan.status === 'repaid' && loan.repaymentDate ? ` (${shortDate(loan.repaymentDate)})` : ''}`;

  return (
    <Shell
      title="Loan interest breakdown"
      subtitle={`${periodLabel} • Total ${inr(totalAmount)} • ${rows.length} loan${rows.length === 1 ? '' : 's'} accruing interest`}
      onClose={onClose}
    >
      {rows.length === 0 ? (
        <EmptyState compact icon={Landmark} title="No interest-bearing loans accrue in this period" />
      ) : (
        <>
          <ListGroup>
            {rows.map(({ loan, days, interest }) => (
              <TextRow
                key={loan.id}
                title={loan.investorName || 'Unknown lender'}
                lines={[
                  `${inr(loan.loanAmount)} at ${loan.interestRate}% a month · taken ${shortDate(loan.loanDate)}`,
                  <span className="capitalize">{days} days in period · {statusText(loan)}</span>,
                ]}
                trailing={<span className="num text-body-md font-semibold text-text">{inr2(interest)}</span>}
              />
            ))}
          </ListGroup>
        </>
      )}
      <p className="text-label text-text-3">Interest accrues daily at principal × monthly rate × days ÷ 30, from the day the loan was taken until it is repaid (or the end of the period).</p>
    </Shell>
  );
}
