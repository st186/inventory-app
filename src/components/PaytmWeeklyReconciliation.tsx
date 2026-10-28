import { useMemo, useState } from 'react';
import { Smartphone, CalendarCheck, AlertTriangle, CheckCircle2, Store } from 'lucide-react';
import { InventoryContextType } from '../App';
import { OnlineCashRecalibration } from './OnlineCashRecalibration';
import { DatePicker } from './DatePicker';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { EmptyState } from './ui/empty-state';
import { ListGroup, ListRow } from './ui/list-row';
import { formatINR } from './ui/money';
import { StatusChip } from './ui/status-chip';
import { OptionChip, SectionHeading } from './insights/parts/common';
import { formatDay } from './team/shared';
import { addDays, formatDateTimeIST, getTodayIST } from '../utils/timezone';
import { knownPaytmBalance } from '../utils/paytmRules';

type Props = {
  context: InventoryContextType;
  // Confirmed real bug: this widget used to always default to its own "most recent
  // Sunday" guess, completely disconnected from whatever store/date the cluster head was
  // already looking at on the rest of the Sales page - opening it from, say, 24 Aug's
  // page could silently show 22 Aug's system balance instead, with nothing on screen
  // explaining why the two didn't match. These just seed the initial selection; the
  // store/date pickers inside stay fully independently changeable, since a cluster head
  // may genuinely want to reconcile a different day than the one they're currently on.
  initialStoreId?: string | null;
  initialDate?: string;
};

// The daily "actualPaytmBalance" on each sales entry is auto-synced from logged
// transactions and can't be hand-edited (see the note in SalesManagement.tsx) - that's
// deliberate so day-to-day entry stays simple. This is the separate, cluster-head-only
// weekly check: physically look at the Paytm app balance every Sunday and compare it
// against what the system thinks the balance should be, surfacing any drift/discrepancy.
// Pure calendar-date maths: the old version built a local-midnight Date and read it back with
// toISOString, which in IST is the previous day (18:30 UTC) - so "Sunday" came out as Saturday.
function mostRecentSunday(fromDate: string): string {
  const [year, month, day] = fromDate.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  return addDays(fromDate, -weekday);
}

export function PaytmWeeklyReconciliation({ context, initialStoreId, initialDate }: Props) {
  const today = getTodayIST();
  const stores = context.stores || [];
  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    (initialStoreId && initialStoreId !== 'all' ? initialStoreId : null) || stores[0]?.id || ''
  );
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || mostRecentSunday(today));
  const [showModal, setShowModal] = useState(false);

  const store = stores.find((s) => s.id === selectedStoreId);

  // System-expected Paytm balance as of the chosen date: the most recent sales entry
  // on/before that date already carries the fully-computed running balance. A POS-sync
  // placeholder's blank (or old 0) balance isn't one, so it's skipped.
  const systemBalance = useMemo(() => {
    const entries = (context.salesData || [])
      .filter((s) => s.storeId === selectedStoreId && s.date <= selectedDate && knownPaytmBalance(s) !== null)
      .sort((a, b) => b.date.localeCompare(a.date));
    return knownPaytmBalance(entries[0]) ?? 0;
  }, [context.salesData, selectedStoreId, selectedDate]);

  const history = useMemo(() => {
    return (context.onlineCashRecalibrations || [])
      .filter((r) => r.storeId === selectedStoreId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);
  }, [context.onlineCashRecalibrations, selectedStoreId]);

  const isSunday = today === mostRecentSunday(today);
  const alreadyLoggedThisWeek = history.some((r) => r.date === mostRecentSunday(today));

  if (stores.length === 0) return null;

  return (
    <section className="mt-6 flex flex-col gap-3" aria-labelledby="paytm-weekly-title">
      <SectionHeading
        id="paytm-weekly-title"
        as="h3"
        title="Weekly Paytm reconciliation"
        caption="Every Sunday, check the real Paytm balance and log it. The app compares it with what it expected."
      />

      {isSunday && !alreadyLoggedThisWeek && (
        <Callout tone="warning" icon={CalendarCheck} title="It's Sunday">Check the actual Paytm balance and log it below.</Callout>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-3">
          {stores.length > 1 && (
            <OptionChip
              value={selectedStoreId}
              options={stores.map((s) => ({ value: s.id, label: s.name }))}
              onChange={setSelectedStoreId}
              title="Store"
              icon={<Store aria-hidden="true" />}
            />
          )}
          <DatePicker label="Day to check" value={selectedDate} max={today} onChange={setSelectedDate} className="min-w-[180px] flex-1" />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <span className="flex min-w-0 flex-col">
            <span className="text-label text-text-3">The app expects on Paytm that day</span>
            <span className="num text-title font-semibold text-text">{formatINR(Math.round(systemBalance))}</span>
          </span>
          <Button variant="secondary" className="w-full sm:w-auto" leadingIcon={<Smartphone />} onClick={() => setShowModal(true)}>Log Paytm balance</Button>
        </div>
      </div>

      <ListGroup
        title="Past checks"
        meta={store?.name}
        empty={<EmptyState compact icon={Smartphone} title={`No checks logged yet for ${store?.name || 'this store'}`} />}
      >
        {history.map((r) => {
          const hasDiscrepancy = Math.abs(r.difference) > 200;
          return (
            <ListRow
              key={r.id}
              title={formatDay(r.date, 'en', { weekday: true })}
              // When the count was logged as well as the day it is for: they can differ by hours
              // (an early-morning count logged for "yesterday"), which decides whether a same-day
              // top-up landed before or after it.
              subtitle={[
                `Counted ${formatINR(Math.round(r.actualBalance))} · app ${formatINR(Math.round(r.systemBalance))}`,
                r.createdAt ? `logged ${formatDateTimeIST(r.createdAt)}` : '',
              ].filter(Boolean).join(' · ')}
              trailing={
                <StatusChip tone={hasDiscrepancy ? 'danger' : 'success'} icon={hasDiscrepancy ? AlertTriangle : CheckCircle2}>
                  <span className="num">{formatINR(Math.round(r.difference), { sign: true })}</span>
                </StatusChip>
              }
            />
          );
        })}
      </ListGroup>

      {showModal && selectedStoreId && (
        <OnlineCashRecalibration
          context={context}
          selectedStoreId={selectedStoreId}
          selectedDate={selectedDate}
          systemBalance={systemBalance}
          onClose={() => setShowModal(false)}
          onSaveSuccess={() => context.refreshData()}
        />
      )}
    </section>
  );
}
