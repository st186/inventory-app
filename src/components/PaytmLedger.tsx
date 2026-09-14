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
    <div className="mt-4 pt-4 border-t border-gray-100">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left">
        <span className="text-xs font-medium text-gray-600">
          Paytm statement ({inWindow.length} entries)
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setRangeKey(k)}
                className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                  rangeKey === k ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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

          <div className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-gray-500">{ledger.anchorLabel}</span>
            <span className="font-semibold text-gray-900 tabular-nums">₹{ledger.anchorBalance.toLocaleString()}</span>
          </div>

          {inWindow.length === 0 ? (
            <p className="text-sm text-gray-500">No Paytm movement in this range.</p>
          ) : (
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              {inWindowNewestFirst.map((l, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 border-b border-gray-50 last:border-b-0">
                  <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${l.credit > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    {l.credit > 0 ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-800 leading-snug">{l.label}</p>
                    <p className="text-[10px] text-gray-400">{l.date}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-semibold tabular-nums ${l.credit > 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {l.credit > 0 ? '+' : '−'}₹{(l.credit > 0 ? l.credit : l.debit).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-gray-400 tabular-nums">₹{l.balance.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-green-50 py-2">
              <p className="text-[10px] text-green-700">In</p>
              <p className="text-xs font-bold text-green-800 tabular-nums">+₹{totalIn.toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-red-50 py-2">
              <p className="text-[10px] text-red-700">Out</p>
              <p className="text-xs font-bold text-red-800 tabular-nums">−₹{totalOut.toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-gray-100 py-2">
              <p className="text-[10px] text-gray-600">Closing</p>
              <p className="text-xs font-bold text-gray-900 tabular-nums">₹{ledger.closingBalance.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
