// Expense entries to check (owner, 28 Oct 2026): what the server's checks found in new purchases
// and expenses (a weight or pack slip, a category that doesn't fit, a repair that doesn't say
// what, a towel bought for the fourth time, a double entry). Each card says what looks wrong;
// Apply fix changes the entry when there is a fix, It's correct closes it. The owner and
// operations managers see every place, an incharge their own (server expenseReview.ts).
import * as React from 'react';
import { AlertTriangle, CheckCircle2, ReceiptText, Wand2 } from 'lucide-react';
import * as api from '../../utils/api';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { EmptyState } from '../ui/empty-state';
import { formatINR } from '../ui/money';
import { ResponsiveModal } from '../ui/responsive-modal';
import { StatusChip } from '../ui/status-chip';
import { toast } from '../ui/sonner';

export function useExpenseFlags(enabled: boolean, accessToken?: string) {
  const [flags, setFlags] = React.useState<api.ExpenseFlag[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const reload = React.useCallback(() => {
    if (!enabled) return;
    api.getExpenseFlags(accessToken).then((list) => { setFlags(list); setLoaded(true); }).catch(() => setLoaded(true));
  }, [enabled, accessToken]);
  React.useEffect(() => { reload(); }, [reload]);
  return { flags, loaded, reload };
}

const entryLine = (f: api.ExpenseFlag) => {
  const e = f.entry;
  if (!e) return f.date;
  const name = e.itemName || e.description || '';
  const qty = e.quantity ? ` · ${e.quantity} ${e.unit || ''}`.trimEnd() : '';
  const place = f.place.startsWith('production') ? 'Production' : 'Store';
  return [`${new Date(`${f.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`, place, `${name}${qty}`, formatINR(Number(e.totalCost ?? e.amount ?? 0)), f.loggedBy ? `by ${f.loggedBy}` : ''].filter(Boolean).join(' · ');
};

function FlagCard({ flag, onDone }: { flag: api.ExpenseFlag; onDone: () => void }) {
  const [busy, setBusy] = React.useState<'apply' | 'dismiss' | null>(null);
  const decide = async (action: 'apply' | 'dismiss') => {
    setBusy(action);
    try {
      await api.decideExpenseFlag(flag.id, action);
      toast.success(action === 'apply' ? 'Entry fixed' : 'Marked as correct');
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save that');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-body-md font-semibold text-text">{flag.title}</span>
        <StatusChip tone="warning" icon={AlertTriangle}>Check</StatusChip>
      </div>
      <p className="num text-label text-text-3">{entryLine(flag)}</p>
      <p className="text-body-sm text-text-2">{flag.message}</p>
      {flag.suggestionText && <p className="text-body-sm text-text"><span className="font-medium">Suggested fix:</span> {flag.suggestionText}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        {flag.suggestion && (
          <Button size="sm" leadingIcon={<Wand2 />} loading={busy === 'apply'} disabled={!!busy} onClick={() => decide('apply')}>Apply fix</Button>
        )}
        <Button size="sm" variant="secondary" leadingIcon={<CheckCircle2 />} loading={busy === 'dismiss'} disabled={!!busy} onClick={() => decide('dismiss')}>It's correct</Button>
      </div>
    </div>
  );
}

export function ExpenseFlagsSheet({ open, onOpenChange, flags, onChanged }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flags: api.ExpenseFlag[];
  onChanged: () => void;
}) {
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Expense entries to check"
      description="Bunny checks every new purchase and expense. Fix what's wrong, or mark it correct."
      size="detail"
    >
      {flags.length === 0 ? (
        <EmptyState compact icon={CheckCircle2} title="Nothing to check" body="New entries are checked as they are saved." />
      ) : (
        <div className="flex flex-col gap-3">
          {flags.map((f) => <FlagCard key={f.id} flag={f} onDone={onChanged} />)}
        </div>
      )}
    </ResponsiveModal>
  );
}

/** The banner on Money > Expenses, and the sheet it opens. */
export function ExpenseFlagsBanner({ enabled, accessToken }: { enabled: boolean; accessToken?: string }) {
  const { flags, reload } = useExpenseFlags(enabled, accessToken);
  const [open, setOpen] = React.useState(false);
  if (!enabled || flags.length === 0) return null;
  return (
    <>
      <Callout
        tone="warning"
        icon={ReceiptText}
        title={flags.length === 1 ? '1 entry to check' : `${flags.length} entries to check`}
        action={<Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Review</Button>}
      >
        {flags.slice(0, 2).map((f) => f.title).join(' · ')}{flags.length > 2 ? ' · …' : ''}
      </Callout>
      <ExpenseFlagsSheet open={open} onOpenChange={setOpen} flags={flags} onChanged={reload} />
    </>
  );
}
