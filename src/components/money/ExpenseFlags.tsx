// Expense entries to check (owner, 28 Oct 2026): what the server's checks found in new purchases
// and expenses (a weight or pack slip, a category that doesn't fit, a repair that doesn't say
// what, a towel bought for the fourth time, a double entry). Each card says what looks wrong;
// Apply fix changes the entry when there is a fix, It's correct closes it. The owner and
// operations managers see every place, an incharge their own (server expenseReview.ts).
// Repairs, labour and equipment also bring: a missing bill photo (add it here), the owner's OK
// above ₹2,000 (only the owner decides), and a machine that keeps needing repairs. A double entry
// or one logged for the wrong place (owner, 29 Oct 2026) can be deleted right here.
// "Much bigger than usual" marked correct asks why (owner, 29 Oct 2026: festival season, the dealer
// shut for a festival, or a reason of their own), so the next big buy and Bunny understand it.
import * as React from 'react';
import { AlertTriangle, Camera, CheckCircle2, ReceiptText, ShieldCheck, Trash2, Wand2, X } from 'lucide-react';
import { compressPhoto } from '../assets/assetsApi';
import { attachBill, billLink, uploadBill } from './paperworkApi';
import * as api from '../../utils/api';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { confirm } from '../ui/confirm';
import { EmptyState } from '../ui/empty-state';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { formatINR } from '../ui/money';
import { ResponsiveModal } from '../ui/responsive-modal';
import { StatusChip } from '../ui/status-chip';
import { toast } from '../ui/sonner';
import { cn } from '../ui/utils';

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

// "Fridge · not cooling · Raju" from a repair or labour entry's details.
const repairLine = (f: api.ExpenseFlag) => {
  const r = f.entry?.repair;
  return r ? [r.machine, r.fault, r.technicianName].filter(Boolean).join(' · ') : '';
};

// What each kind of check offers: [label for apply, label for dismiss] (null: not offered).
const ACTIONS: Record<string, { apply: string | null; dismiss: string; applied: string; dismissed: string }> = {
  approval: { apply: 'OK', dismiss: 'Not OK', applied: 'OK given', dismissed: 'Marked not OK' },
  bill: { apply: null, dismiss: 'No bill given', applied: '', dismissed: 'Closed without a bill' },
  replace: { apply: null, dismiss: 'Noted', applied: '', dismissed: 'Noted' },
};

// Why a big buy was right: kept on the entry (server expenseReview.ts BIG_BUY_REASONS).
const BIG_BUY_REASONS: { id: string; label: string; hint: string }[] = [
  { id: 'festival', label: 'Festival season', hint: 'More sales, so more was needed' },
  { id: 'shop_closed', label: 'Shop closed for a festival', hint: 'The dealer is shut, so bought ahead' },
  { id: 'bulk', label: 'Bought in bulk', hint: 'A big lot that lasts longer' },
  { id: 'price_up', label: 'The price went up', hint: 'The usual amount, at a higher price' },
  { id: 'other', label: 'Something else', hint: 'Write why below' },
];
const ASKS_WHY = ['unusual'];

function BigBuyReason({ flag, onCancel, onDone }: { flag: api.ExpenseFlag; onCancel: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState(flag.hint?.reason || '');
  const [note, setNote] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const save = async () => {
    if (reason === 'other' && !note.trim()) {
      toast.error('Write why it was bigger');
      return;
    }
    setSaving(true);
    try {
      await api.decideExpenseFlag(flag.id, 'dismiss', note.trim() || undefined, undefined, reason);
      toast.success('Saved. Bunny will remember why.');
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save that');
    } finally {
      setSaving(false);
    }
  };
  return (
    <fieldset className="flex flex-col gap-2 border-t border-border pt-3">
      <legend className="mb-1.5 text-body-sm font-medium text-text">Why was it bigger?</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Why was it bigger?">
        {BIG_BUY_REASONS.map((r) => {
          const on = reason === r.id;
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setReason(r.id)}
              className={cn(
                'flex min-h-12 flex-col rounded-md border px-3 py-2 text-left outline-none transition-colors duration-(--dur-fast) focus-visible:ring-2 focus-visible:ring-ring',
                on ? 'border-primary bg-primary-soft' : 'border-border-strong bg-surface hover:bg-surface-2',
              )}
            >
              <span className={cn('text-body-sm font-semibold', on ? 'text-primary' : 'text-text')}>{r.label}</span>
              <span className="text-caption text-text-3">{r.hint}</span>
            </button>
          );
        })}
      </div>
      <Field label={reason === 'other' ? 'Why' : 'Which festival, or a note'} required={reason === 'other'} optional={reason !== 'other'}>
        <Input value={note} maxLength={300} placeholder="e.g. Kali Puja, the shop is shut 3 days" onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" leadingIcon={<CheckCircle2 />} loading={saving} disabled={!reason} onClick={save}>Save</Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button>
      </div>
    </fieldset>
  );
}

function FlagCard({ flag, onDone }: { flag: api.ExpenseFlag; onDone: () => void }) {
  const [busy, setBusy] = React.useState<'apply' | 'dismiss' | 'bill' | 'view' | 'delete' | null>(null);
  const [askWhy, setAskWhy] = React.useState(false);
  const billInput = React.useRef<HTMLInputElement>(null);
  const kind = ACTIONS[flag.kind];
  const decide = async (action: 'apply' | 'dismiss') => {
    setBusy(action);
    try {
      await api.decideExpenseFlag(flag.id, action);
      toast.success(action === 'apply' ? (kind?.applied || 'Entry fixed') : (kind?.dismissed || 'Marked as correct'));
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save that');
    } finally {
      setBusy(null);
    }
  };
  const addBill = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('bill');
    try {
      await attachBill(flag.id, await uploadBill(await compressPhoto(file)));
      toast.success('Bill photo added');
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the bill photo');
    } finally {
      setBusy(null);
    }
  };
  const viewBill = async () => {
    if (!flag.entry?.billPhotoPath) return;
    setBusy('view');
    try { window.open(await billLink(flag.entry.billPhotoPath), '_blank', 'noopener'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not open the bill'); } finally { setBusy(null); }
  };
  const removable = (flag.kind === 'duplicate' || flag.kind === 'place') && !!flag.entry;
  const remove = async () => {
    const ok = await confirm({ title: 'Delete this entry?', body: entryLine(flag), confirmLabel: 'Delete entry', tone: 'danger' });
    if (!ok) return;
    setBusy('delete');
    try {
      await api.deleteFlaggedEntry(flag);
      toast.success('Entry deleted');
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete it');
    } finally {
      setBusy(null);
    }
  };
  const waiting = flag.kind === 'approval' && !flag.canDecide;
  const detail = repairLine(flag);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-body-md font-semibold text-text">{flag.title}</span>
        {flag.kind === 'approval'
          ? <StatusChip tone="info" icon={ShieldCheck}>{waiting ? "Owner's OK" : 'Your OK'}</StatusChip>
          : <StatusChip tone="warning" icon={AlertTriangle}>Check</StatusChip>}
      </div>
      <p className="num text-label text-text-3">{entryLine(flag)}</p>
      {detail && <p className="text-label text-text-2">{detail}</p>}
      <p className="text-body-sm text-text-2">{flag.message}</p>
      {flag.suggestionText && <p className="text-body-sm text-text"><span className="font-medium">Suggested fix:</span> {flag.suggestionText}</p>}
      {waiting ? (
        <p className="text-label text-text-3">Waiting for the owner's OK.</p>
      ) : askWhy ? (
        <BigBuyReason flag={flag} onCancel={() => setAskWhy(false)} onDone={onDone} />
      ) : (
        <div className="flex flex-wrap gap-2 pt-1">
          {flag.kind === 'bill' && (
            <>
              <Button size="sm" leadingIcon={<Camera />} loading={busy === 'bill'} disabled={!!busy} onClick={() => billInput.current?.click()}>Add bill photo</Button>
              <input ref={billInput} type="file" accept="image/*" capture="environment" className="sr-only" onChange={addBill} />
            </>
          )}
          {removable && (
            <Button size="sm" variant="danger-ghost" leadingIcon={<Trash2 />} loading={busy === 'delete'} disabled={!!busy} onClick={remove}>Delete this entry</Button>
          )}
          {(kind ? kind.apply : flag.suggestion ? 'Apply fix' : null) && (
            <Button size="sm" leadingIcon={kind ? <CheckCircle2 /> : <Wand2 />} loading={busy === 'apply'} disabled={!!busy} onClick={() => decide('apply')}>{kind?.apply || 'Apply fix'}</Button>
          )}
          <Button size="sm" variant="secondary" leadingIcon={flag.kind === 'approval' ? <X /> : <CheckCircle2 />} loading={busy === 'dismiss'} disabled={!!busy} onClick={() => (ASKS_WHY.includes(flag.kind) ? setAskWhy(true) : decide('dismiss'))}>{kind?.dismiss || "It's correct"}</Button>
          {flag.entry?.billPhotoPath && (
            <Button size="sm" variant="ghost" leadingIcon={<ReceiptText />} loading={busy === 'view'} disabled={!!busy} onClick={viewBill}>View bill</Button>
          )}
        </div>
      )}
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
