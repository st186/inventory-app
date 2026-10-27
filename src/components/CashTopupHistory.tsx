import { useMemo, useState } from 'react';
import { CheckCircle2, History, XCircle } from 'lucide-react';
import * as api from '../utils/api';
import { getTodayIST, formatDateTimeIST } from '../utils/timezone';
import { EmptyState } from './ui/empty-state';
import { ListGroup, ListRow } from './ui/list-row';
import { formatINR } from './ui/money';
import { StatGrid, StatTile } from './ui/stat-tile';
import { StatusChip } from './ui/status-chip';
import type { RangePreset } from './ui/date-utils';
import { PeriodChip } from './insights/parts/common';

const TOPUP_REASON_LABELS: Record<api.CashTopupReason, string> = {
  store_inventory: 'Store inventory',
  production_inventory: 'Production house inventory',
  other: 'Other',
  event_cash: 'Event stall cash',
};

type HistoryFilter = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'custom';

// The shared period chip, mapped onto this list's own filter keys (same date maths as before).
const HISTORY_PERIODS: Partial<Record<RangePreset, HistoryFilter>> = {
  today: 'today', yesterday: 'yesterday', thisWeek: 'thisWeek', thisMonth: 'thisMonth', lastMonth: 'lastMonth', custom: 'custom',
};

// Local-date-safe (avoids the .toISOString() UTC rollback bug) - IST is UTC+5:30, so
// converting a local date to UTC before slicing out Y/M/D can roll it back a day.
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getRange(filter: HistoryFilter, custom: { from: string; to: string }): { start: string; end: string } {
  const today = new Date();
  switch (filter) {
    case 'today': {
      const t = getTodayIST();
      return { start: t, end: t };
    }
    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const s = toLocalDateStr(y);
      return { start: s, end: s };
    }
    case 'thisWeek': {
      const start = new Date(today);
      const day = start.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      start.setDate(start.getDate() + diff);
      return { start: toLocalDateStr(start), end: getTodayIST() };
    }
    case 'thisMonth': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: toLocalDateStr(start), end: getTodayIST() };
    }
    case 'lastMonth': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: toLocalDateStr(start), end: toLocalDateStr(end) };
    }
    case 'custom':
      return { start: custom.from, end: custom.to };
  }
}

type Props = {
  requests: api.CashTopupRequest[];
  title?: string;
};

// Approved/rejected cash top-up requests - collapsed by default, with a date filter
// (defaulting to This Week) since the pending list elsewhere is what usually needs
// attention. `requests` is expected to already be the full, unfiltered-by-store list -
// every requester (store incharge, production incharge, operations manager) sees the
// same global ledger a cluster head does, not just their own requests.
export function CashTopupHistory({ requests, title = 'Top-up history' }: Props) {
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState<HistoryFilter>('thisWeek');
  const [customRange, setCustomRange] = useState({
    from: toLocalDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
    to: getTodayIST(),
  });

  const decided = useMemo(
    () => requests.filter(r => r.status !== 'pending').sort((a, b) => b.date.localeCompare(a.date)),
    [requests]
  );

  const range = getRange(filter, customRange);
  const filtered = decided.filter(r => r.date >= range.start && r.date <= range.end);

  // Month-to-date approved top-ups, split store vs production house - a quick read on
  // how much has been pulled from the Paytm/bank balance into physical cash this month.
  const thisMonth = getTodayIST().slice(0, 7);
  const monthSummary = useMemo(() => {
    let store = 0, production = 0, other = 0;
    for (const r of requests) {
      if (r.status !== 'approved' || !r.date.startsWith(thisMonth)) continue;
      if (r.reason === 'production_inventory') production += r.requestedAmount;
      else if (r.reason === 'store_inventory') store += r.requestedAmount;
      else other += r.requestedAmount;
    }
    return { store, production, other, total: store + production + other };
  }, [requests, thisMonth]);

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section className="flex flex-col gap-2.5" aria-labelledby="topups-month-title">
        <h3 id="topups-month-title" className="text-subtitle font-semibold text-text">Cash top-ups approved this month</h3>
        <StatGrid>
          <StatTile label="Store inventory" value={formatINR(monthSummary.store)} />
          <StatTile label="Production house" value={formatINR(monthSummary.production)} />
        </StatGrid>
        {(monthSummary.other > 0 || monthSummary.total > 0) && (
          <p className="num text-label text-text-3">
            {monthSummary.other > 0 ? `+ ${formatINR(monthSummary.other)} other · ` : ''}
            Total {formatINR(monthSummary.total)} this month
          </p>
        )}
      </section>

      <ListGroup
        title={title}
        meta={`${filtered.length} of ${decided.length}`}
        action={show ? (
          <PeriodChip value={filter} options={HISTORY_PERIODS} custom={customRange} onChange={(f, custom) => { setFilter(f); if (custom) setCustomRange(custom); }} />
        ) : undefined}
        empty={<EmptyState compact icon={History} title="No decided top-ups in this period" body="Pick a longer period." />}
      >
        {!show ? (
          <ListRow muted title="Show approved and rejected top-ups" onClick={() => setShow(true)} chevron="down" aria-expanded={false} />
        ) : (
          filtered.map(r => {
            const decidedAt = r.status === 'approved' ? r.approvedAt : r.rejectedAt;
            const by = r.status === 'approved' && r.approvedBy ? `Approved by ${r.approvedBy}` : r.status === 'rejected' && r.rejectedBy ? `Rejected by ${r.rejectedBy}` : '';
            return (
              <div key={r.id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="num text-body-md font-medium text-text">{formatINR(r.requestedAmount)} for {r.date}</span>
                  <span className="text-label text-text-2">
                    {r.requestedByName} ({r.requestedByEntityName}) · {TOPUP_REASON_LABELS[r.reason]} · #{r.id.slice(-6).toUpperCase()}
                  </span>
                  <span className="text-label text-text-3">
                    Requested {formatDateTimeIST(r.requestDate, false)}
                    {by ? ` · ${by}` : ''}
                    {/* approvedAt is real UTC on approvals flagged approvedAtIsUtc, IST-with-Z before that. */}
                    {decidedAt ? ` · ${formatDateTimeIST(decidedAt, r.status === 'approved' && !!r.approvedAtIsUtc)} IST` : ''}
                  </span>
                  {r.status === 'rejected' && r.rejectionReason && <span className="text-label text-danger">Reason: {r.rejectionReason}</span>}
                </div>
                {r.status === 'approved'
                  ? <StatusChip tone="success" icon={CheckCircle2}>Approved</StatusChip>
                  : <StatusChip tone="danger" icon={XCircle}>Rejected</StatusChip>}
              </div>
            );
          })
        )}
      </ListGroup>
    </div>
  );
}
