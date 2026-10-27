import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle, X } from 'lucide-react';
import * as api from '../utils/api';
import { DatePicker } from './DatePicker';
import { getTodayIST, formatDateTimeIST } from '../utils/timezone';

const TOPUP_REASON_LABELS: Record<api.CashTopupReason, string> = {
  store_inventory: 'Store Inventory',
  production_inventory: 'Production House Inventory',
  other: 'Other',
  event_cash: 'Event stall cash',
};

type HistoryFilter = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'custom';

const FILTER_LABELS: Record<HistoryFilter, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
  custom: 'Custom',
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
export function CashTopupHistory({ requests, title = 'Top-up History' }: Props) {
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
    <>
    <div className="mt-4 pt-4 border-t border-border">
      <p className="text-xs font-medium text-text-2 mb-2">Cash top-ups approved this month</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-info-soft border border-info-border p-3">
          <p className="text-caption text-info font-medium">Store inventory</p>
          <p className="text-lg font-bold text-info tabular-nums">₹{monthSummary.store.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-warning-soft border border-warning-border p-3">
          <p className="text-caption text-warning font-medium">Production house</p>
          <p className="text-lg font-bold text-warning tabular-nums">₹{monthSummary.production.toLocaleString()}</p>
        </div>
      </div>
      {(monthSummary.other > 0 || monthSummary.total > 0) && (
        <p className="text-caption text-text-3 mt-1.5">
          {monthSummary.other > 0 ? `+ ₹${monthSummary.other.toLocaleString()} other · ` : ''}
          Total ₹{monthSummary.total.toLocaleString()} this month
        </p>
      )}
    </div>
    <div className="mt-4 pt-4 border-t border-border">
      <button
        onClick={() => setShow(!show)}
        className="min-h-11 w-full flex items-center justify-between text-left"
      >
        <span className="text-xs font-medium text-text-2">
          {title} ({filtered.length} of {decided.length})
        </span>
        {show ? <ChevronUp className="w-4 h-4 text-text-3" /> : <ChevronDown className="w-4 h-4 text-text-3" />}
      </button>

      {show && (
        <div className="mt-2 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(FILTER_LABELS) as HistoryFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`hit-44 px-2.5 py-1 rounded-full text-xs transition-colors ${
                  filter === f ? 'bg-primary text-white' : 'bg-surface-2 text-text-2 hover:bg-surface-3'
                }`}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>

          {filter === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <DatePicker label="From" value={customRange.from} onChange={(d) => setCustomRange({ ...customRange, from: d })} />
              <DatePicker label="To" value={customRange.to} onChange={(d) => setCustomRange({ ...customRange, to: d })} />
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="text-sm text-text-3">No decided top-up requests in this range.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(r => (
                <div key={r.id} className="rounded-xl border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                      <p className="text-sm text-text">₹{r.requestedAmount.toLocaleString()} for {r.date}</p>
                        <span className="text-caption font-mono text-text-3 bg-surface-2 rounded px-1.5 py-0.5">#{r.id.slice(-6).toUpperCase()}</span>
                      </div>
                      <p className="text-xs text-text-3">
                        {r.requestedByName} ({r.requestedByEntityName}) — {TOPUP_REASON_LABELS[r.reason]}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs flex-shrink-0 ${
                      r.status === 'approved' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
                    }`}>
                      {r.status === 'approved' ? <CheckCircle className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                      {r.status === 'approved' ? 'Approved' : 'Rejected'}
                    </span>
                  </div>
                  <p className="text-xs text-text-3 mt-1.5">
                    Requested {formatDateTimeIST(r.requestDate, false)}
                  </p>
                  <p className="text-xs text-text-3 mt-0.5">
                    {r.status === 'approved' && r.approvedBy ? `Approved by ${r.approvedBy}` : ''}
                    {r.status === 'rejected' && r.rejectedBy ? `Rejected by ${r.rejectedBy}` : ''}
                    {/* approvedAt is real UTC on approvals flagged approvedAtIsUtc, IST-with-Z before that. */}
                    {(r.status === 'approved' ? r.approvedAt : r.rejectedAt) && (
                      <span> · {formatDateTimeIST((r.status === 'approved' ? r.approvedAt : r.rejectedAt)!, r.status === 'approved' && !!r.approvedAtIsUtc)} IST</span>
                    )}
                  </p>
                  {r.status === 'rejected' && r.rejectionReason && (
                    <p className="text-xs text-danger mt-0.5">Reason: {r.rejectionReason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}
