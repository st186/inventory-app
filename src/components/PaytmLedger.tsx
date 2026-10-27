import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { computePaytmLedger, type PaytmBalanceInput } from '../utils/paytmBalance';
import { getTodayIST } from '../utils/timezone';
import { DatePicker } from './DatePicker';

type LedgerInput = Omit<PaytmBalanceInput, 'selectedDate' | 'todaysPaytmReceived' | 'todaysUsedOnlineMoney'>;

type RangeKey = 'thisWeek' | 'thisMonth' | 'lastMonth' | 'custom';
const RANGE_LABELS: Record<RangeKey, string> = {
  thisWeek: 'This Week',
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
  custom: 'Custom',
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function rangeFor(key: RangeKey, custom: { from: string; to: string }): { from: string; to: string } {
  const now = new Date();
  const today = getTodayIST();
  switch (key) {
    case 'thisWeek': {
      const s = new Date(now);
      const day = s.getDay();
      s.setDate(s.getDate() + (day === 0 ? -6 : 1 - day));
      return { from: ymd(s), to: today };
    }
    case 'thisMonth':
      return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case 'lastMonth':
      return {
        from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'custom':
      return custom;
  }
}

/**
 * A transaction-level statement for the store's Online Cash (Paytm/UPI) balance -
 * every credit and debit with a running balance, so a discrepancy can be traced to
 * the exact line. Same data and sign conventions as the Paytm reconciliation figure,
 * so the closing balance ties out.
 */
export function PaytmLedger({ input, defaultOpen = false }: { input: LedgerInput; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [rangeKey, setRangeKey] = useState<RangeKey>('thisMonth');
  const [custom, setCustom] = useState({
    from: ymd(new Date(Date.now() - 30 * 86400000)),
    to: getTodayIST(),
  });

  const range = rangeFor(rangeKey, custom);
  const ledger = useMemo(
    () => computePaytmLedger(input, range.from, range.to),
    [input, range.from, range.to],
  );

  const inWindow = ledger.lines.filter((l) => l.date >= range.from && l.date <= range.to);
  const totalIn = inWindow.reduce((s, l) => s + l.credit, 0);
  const totalOut = inWindow.reduce((s, l) => s + l.debit, 0);
  // Running balance is computed chronologically (each line depends on the one before
  // it), but newest-first reads easier - reverse only for display.
  const inWindowNewestFirst = [...inWindow].reverse();

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <button onClick={() => setOpen(!open)} className="min-h-11 w-full flex items-center justify-between text-left">
        <span className="text-xs font-medium text-text-2">
          Paytm statement ({inWindow.length} entries)
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-text-3" /> : <ChevronDown className="w-4 h-4 text-text-3" />}
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setRangeKey(k)}
                className={`hit-44 px-2.5 py-1 rounded-full text-xs transition-colors ${
                  rangeKey === k ? 'bg-primary text-white' : 'bg-surface-2 text-text-2 hover:bg-surface-3'
                }`}
              >
                {RANGE_LABELS[k]}
              </button>
            ))}
          </div>

          {rangeKey === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <DatePicker label="From" value={custom.from} onChange={(d) => setCustom({ ...custom, from: d })} />
              <DatePicker label="To" value={custom.to} onChange={(d) => setCustom({ ...custom, to: d })} />
            </div>
          )}

          <div className="flex items-center justify-between text-xs bg-surface-2 rounded-lg px-3 py-2">
            <span className="text-text-3">{ledger.anchorLabel}</span>
            <span className="font-semibold text-text tabular-nums">₹{ledger.anchorBalance.toLocaleString()}</span>
          </div>

          {inWindow.length === 0 ? (
            <p className="text-sm text-text-3">No Paytm movement in this range.</p>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              {inWindowNewestFirst.map((l, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 border-b border-border last:border-b-0">
                  <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${l.credit > 0 ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>
                    {l.credit > 0 ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-text leading-snug">{l.label}</p>
                    <p className="text-caption text-text-3">{l.date}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-semibold tabular-nums ${l.credit > 0 ? 'text-success' : 'text-danger'}`}>
                      {l.credit > 0 ? '+' : '−'}₹{(l.credit > 0 ? l.credit : l.debit).toLocaleString()}
                    </p>
                    <p className="text-caption text-text-3 tabular-nums">₹{l.balance.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-success-soft py-2">
              <p className="text-caption text-success">In</p>
              <p className="text-xs font-bold text-success tabular-nums">+₹{totalIn.toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-danger-soft py-2">
              <p className="text-caption text-danger">Out</p>
              <p className="text-xs font-bold text-danger tabular-nums">−₹{totalOut.toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-surface-2 py-2">
              <p className="text-caption text-text-2">Closing</p>
              <p className="text-xs font-bold text-text tabular-nums">₹{ledger.closingBalance.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
