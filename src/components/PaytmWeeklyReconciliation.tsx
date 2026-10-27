import { useMemo, useState } from 'react';
import { Smartphone, CalendarCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { InventoryContextType } from '../App';
import { OnlineCashRecalibration } from './OnlineCashRecalibration';
import { addDays, getTodayIST } from '../utils/timezone';
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
    <div className="mt-6 bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-xl bg-surface border border-border flex items-center justify-center shadow-md flex-shrink-0">
          <Smartphone className="w-4 h-4 text-text" />
        </div>
        <h2 className="text-foreground font-bold text-lg sm:text-xl tracking-tight">Weekly Paytm Reconciliation</h2>
      </div>

      {isSunday && !alreadyLoggedThisWeek && (
        <div className="mb-4 rounded-xl border border-warning-border bg-warning-soft p-3 flex items-center gap-2">
          <CalendarCheck className="w-4 h-4 text-warning flex-shrink-0" />
          <p className="text-sm text-warning">It's Sunday — check the actual Paytm balance and log it below.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={selectedStoreId}
          onChange={(e) => setSelectedStoreId(e.target.value)}
          className="min-h-11 px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input
          type="date"
          value={selectedDate}
          max={today}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="min-h-11 px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
        />
        <button
          onClick={() => setShowModal(true)}
          className="min-h-11 inline-flex items-center gap-1.5 px-3 py-2 border border-border-strong bg-surface text-text rounded-lg text-sm hover:bg-surface-2 transition-colors"
        >
          <Smartphone className="w-4 h-4" /> Log Paytm Balance
        </button>
      </div>

      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reconciliations logged yet for {store?.name || 'this store'}.</p>
      ) : (
        <div className="space-y-2">
          {history.map((r) => {
            const hasDiscrepancy = Math.abs(r.difference) > 200;
            return (
              <div key={r.id} className="rounded-xl border border-border bg-background p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">
                    {new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {/* When this count was actually logged, not just which business day it's
                        dated for - the two can differ by hours (a very-early-morning count
                        logged for "yesterday", or a late one after midnight) and that gap
                        matters for deciding whether a same-day top-up landed before or after
                        this reconciliation, per PRODUCTION_CASH_GO_LIVE_DATE-era late-topup
                        logic elsewhere. */}
                    {r.createdAt && (
                      <span className="text-muted-foreground font-normal">
                        {' '}· logged {new Date(r.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    System ₹{r.systemBalance.toLocaleString()} vs Actual ₹{r.actualBalance.toLocaleString()}
                  </p>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs ${hasDiscrepancy ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>
                  {hasDiscrepancy ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {r.difference >= 0 ? '+' : ''}₹{r.difference.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}

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
    </div>
  );
}
