import { useMemo, useState } from 'react';
import { ChevronUp, ArrowDownLeft, ArrowUpRight, Smartphone } from 'lucide-react';
import { computePaytmLedger, type PaytmBalanceInput } from '../utils/paytmBalance';
import { getTodayIST } from '../utils/timezone';
import { Card } from './ui/card';
import { EmptyState } from './ui/empty-state';
import { ListGroup, ListRow } from './ui/list-row';
import { formatINR } from './ui/money';
import type { RangePreset } from './ui/date-utils';
import { MiniFigures, PeriodChip } from './insights/parts/common';

type LedgerInput = Omit<PaytmBalanceInput, 'selectedDate' | 'todaysPaytmReceived' | 'todaysUsedOnlineMoney'>;

type RangeKey = 'thisWeek' | 'thisMonth' | 'lastMonth' | 'custom';
// The shared period chip, mapped onto this statement's own range keys (same date maths as before).
const LEDGER_PERIODS: Partial<Record<RangePreset, RangeKey>> = { thisWeek: 'thisWeek', thisMonth: 'thisMonth', lastMonth: 'lastMonth', custom: 'custom' };

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

  if (!open) {
    return (
      <ListGroup className="mt-6">
        <ListRow icon={Smartphone} title="Paytm statement" subtitle={`${inWindow.length} entries · every credit and debit with the running balance`} onClick={() => setOpen(true)} chevron="down" aria-expanded={false} />
      </ListGroup>
    );
  }

  return (
    <section className="mt-6 flex flex-col gap-3" aria-labelledby="paytm-statement-title">
      <div className="flex items-center justify-between gap-3">
        <h3 id="paytm-statement-title" className="text-subtitle font-semibold text-text">
          Paytm statement <span className="text-label font-normal text-text-3">{inWindow.length} entries</span>
        </h3>
        <PeriodChip value={rangeKey} options={LEDGER_PERIODS} custom={custom} onChange={(k, c) => { setRangeKey(k); if (c) setCustom(c); }} />
      </div>
      <Card className="gap-3">
        <MiniFigures
          items={[
            { label: 'In', value: `+${formatINR(totalIn)}`, tone: 'success' },
            { label: 'Out', value: `−${formatINR(totalOut)}`, tone: 'danger' },
            { label: 'Closing', value: formatINR(ledger.closingBalance) },
          ]}
        />
      </Card>
      <ListGroup>
        <ListRow density="compact" muted title={ledger.anchorLabel} trailing={<span className="num text-body-md font-semibold text-text">{formatINR(ledger.anchorBalance)}</span>} />
        {inWindow.length === 0 && <EmptyState compact icon={Smartphone} title="No Paytm movement in this period" />}
        {inWindowNewestFirst.map((l, i) => (
          <ListRow
            key={i}
            icon={l.credit > 0 ? ArrowDownLeft : ArrowUpRight}
            iconTone={l.credit > 0 ? 'success' : 'danger'}
            title={<span className="text-body-sm">{l.label}</span>}
            subtitle={l.date}
            trailing={
              <span className="flex flex-col items-end">
                <span className={`num text-body-md font-semibold ${l.credit > 0 ? 'text-success' : 'text-danger'}`}>
                  {l.credit > 0 ? '+' : '−'}{formatINR(l.credit > 0 ? l.credit : l.debit)}
                </span>
                <span className="num text-caption text-text-3">{formatINR(l.balance)}</span>
              </span>
            }
          />
        ))}
      </ListGroup>
      <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 w-fit items-center gap-1 text-body-sm font-medium text-text-2 hover:text-text">
        <ChevronUp className="size-4" aria-hidden="true" /> Hide the statement
      </button>
    </section>
  );
}
