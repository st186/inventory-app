// Expenses and cash: the stall's own cash in hand (sales in; cash-paid rent and expenses out;
// approved top-ups, floats and handovers), its separate digital account if it has one, cash
// top-up requests (approved by the owner or an operations manager, who pick whether the store's
// Paytm or the production house's cash pays), rent, and every expense.
import * as React from 'react';
import { ArrowDownLeft, ArrowUpRight, Banknote, Ban, CheckCircle2, Clock, HandCoins, Plus, Receipt, Smartphone, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ListGroup, ListRow } from '../ui/list-row';
import { StatusChip } from '../ui/status-chip';
import { Button } from '../ui/button';
import { Money, MoneyInput } from '../ui/money';
import { StatGrid, StatTile } from '../ui/stat-tile';
import { ResponsiveModal } from '../ui/responsive-modal';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { SegmentedControl } from '../ui/segmented-control';
import { ChoiceChips } from '../ui/chip';
import { Callout } from '../ui/callout';
import { confirm, promptText } from '../ui/confirm';
import { useT, type I18nKey } from '../../utils/i18n';
import type { EventBundle, EventExpense, EventTopup } from '../../utils/eventsApi';
import { EXPENSE_CATEGORIES, shortDate, useEventsApi } from './eventsShared';

type Category = typeof EXPENSE_CATEGORIES[number];

export function EventMoneyTab({ bundle, onChanged }: { bundle: EventBundle; onChanged: () => void }) {
  const { t, lang } = useT();
  const api = useEventsApi();
  const ev = bundle.event;
  const p = bundle.permissions;
  const separate = bundle.digitalAccount.mode === 'separate';
  const [expenseOpen, setExpenseOpen] = React.useState(false);
  const [cashOpen, setCashOpen] = React.useState(false);
  const [moveOpen, setMoveOpen] = React.useState<null | 'cash' | 'digital'>(null);
  const [approving, setApproving] = React.useState<EventTopup | null>(null);
  const [showAllCash, setShowAllCash] = React.useState(false);
  const live = bundle.expenses.filter((e) => !e.voided);
  const rentPaid = live.filter((e) => e.category === 'rent').reduce((s, e) => s + e.amount, 0);
  const cashLines = [...bundle.cash.lines].reverse();

  const voidExpense = async (e: EventExpense) => {
    const ok = await confirm({ title: 'Void this expense?', body: `${e.description} · ₹${e.amount.toLocaleString('en-IN')}. It stays on record, marked void, and leaves the totals.`, confirmLabel: 'Void expense', tone: 'danger' });
    if (!ok) return;
    try { await api.voidExpense(ev.id, e.id); toast.success('Expense voided'); onChanged(); } catch (err: any) { toast.error(err?.message || 'Could not void'); }
  };
  const reject = async (x: EventTopup) => {
    const reason = await promptText({ title: 'Reject the cash request?', label: 'Reason', placeholder: 'Optional', confirmLabel: 'Reject', tone: 'danger' });
    if (reason === null) return;
    try { await api.rejectCash(x.id, reason); toast.success('Request rejected'); onChanged(); } catch (err: any) { toast.error(err?.message || 'Could not reject'); }
  };

  const topupChip = (x: EventTopup) =>
    x.status === 'approved' ? <StatusChip status="approval.approved" size="sm" />
      : x.status === 'rejected' ? <StatusChip status="approval.rejected" size="sm" />
      : <StatusChip status="approval.pending" size="sm" />;

  return (
    <div className="flex flex-col gap-5" lang={lang}>
      <StatGrid>
        <StatTile label={t('event.cashInHand')} value={<Money value={bundle.cash.inHand} />} caption="Its own cash, not the store's" />
        {separate
          ? <StatTile label={bundle.digitalAccount.name} value={<Money value={bundle.digital.balance} />} caption="Separate account" />
          : <StatTile label="Digital" value={<span className="text-title font-semibold">Store Paytm</span>} caption={`Rolls into ${bundle.store?.name || 'the store'}'s Paytm`} />}
      </StatGrid>

      {p.canMoveMoney && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" leadingIcon={<HandCoins />} onClick={() => setCashOpen(true)}>{t('event.askCash')}</Button>
          <Button variant="secondary" leadingIcon={<Banknote />} onClick={() => setMoveOpen('cash')}>Cash in / out</Button>
        </div>
      )}

      <ListGroup title="Cash requests" empty={t('event.nothingYet')}>
        {bundle.topups.map((x) => (
          <ListRow
            key={x.id}
            icon={x.status === 'approved' ? CheckCircle2 : x.status === 'rejected' ? XCircle : Clock}
            iconTone={x.status === 'approved' ? 'success' : x.status === 'rejected' ? 'danger' : 'neutral'}
            title={`₹${x.requestedAmount.toLocaleString('en-IN')} · ${shortDate(x.date, lang)}`}
            subtitle={[x.note, x.requestedByName, x.status === 'approved' ? (x.fundingSource === 'production_cash' ? "From production's cash" : "From the store's Paytm") : null, x.rejectionReason].filter(Boolean).join(' · ')}
            trailing={x.status === 'pending' && p.canRunStock ? <Button size="sm" onClick={() => setApproving(x)}>Review</Button> : topupChip(x)}
          />
        ))}
      </ListGroup>

      <ListGroup
        title={t('event.cashLedger')}
        action={cashLines.length > 6 ? <Button variant="link" size="sm" onClick={() => setShowAllCash((v) => !v)}>{showAllCash ? 'Show less' : t('common.seeAll', { n: cashLines.length })}</Button> : undefined}
        empty={t('event.nothingYet')}
      >
        {(showAllCash ? cashLines : cashLines.slice(0, 6)).map((l, i) => (
          <ListRow key={`${l.date}-${l.ref || l.label}-${i}`} density="compact" icon={l.amount >= 0 ? ArrowDownLeft : ArrowUpRight} iconTone={l.amount >= 0 ? 'success' : 'neutral'} title={l.label} subtitle={shortDate(l.date, lang)} amount={l.amount} />
        ))}
      </ListGroup>

      {separate && (
        <ListGroup
          title={`${bundle.digitalAccount.name} account`}
          meta={<Money value={bundle.digital.balance} className="text-label font-semibold" />}
          action={p.canMoveMoney ? <Button variant="secondary" size="sm" onClick={() => setMoveOpen('digital')}>Transfer out</Button> : undefined}
          empty={t('event.nothingYet')}
        >
          {[...bundle.digital.lines].reverse().slice(0, 8).map((l, i) => (
            <ListRow key={`${l.date}-${l.ref || l.label}-${i}`} density="compact" icon={Smartphone} title={l.label} subtitle={shortDate(l.date, lang)} amount={l.amount} />
          ))}
        </ListGroup>
      )}

      <ListGroup title={t('event.cat.rent')}>
        <ListRow density="compact" title="Agreed" subtitle={ev.rent.mode === 'per_day' ? 'Per day' : 'Total for the event'} amount={ev.rent.amount || 0} />
        <ListRow density="compact" title="Paid so far" amount={rentPaid} />
      </ListGroup>

      <ListGroup
        title="Expenses"
        meta={<Money value={live.filter((e) => e.category !== 'rent').reduce((s, e) => s + e.amount, 0)} className="text-label font-semibold" />}
        action={p.canEnter ? <Button size="sm" variant="secondary" leadingIcon={<Plus />} onClick={() => setExpenseOpen(true)}>{t('expense.add')}</Button> : undefined}
        empty={t('event.nothingYet')}
      >
        {bundle.expenses.map((e) => (
          <ListRow
            key={e.id}
            icon={e.voided ? Ban : Receipt}
            muted={e.voided}
            title={e.description}
            subtitle={[t(`event.cat.${e.category}` as I18nKey), shortDate(e.date, lang), e.paidFrom === 'event_cash' ? t('event.paidFromCash') : e.paidFrom === 'event_digital' ? bundle.digitalAccount.name : t('event.paidFromOwner'), e.voided ? 'Void' : e.createdByName].filter(Boolean).join(' · ')}
            amount={e.amount}
            onClick={p.canRunStock && !e.voided && ev.status !== 'closed' ? () => voidExpense(e) : undefined}
            chevron={false}
          />
        ))}
      </ListGroup>

      <ExpenseSheet open={expenseOpen} onOpenChange={setExpenseOpen} bundle={bundle} onDone={onChanged} />
      <AskCashSheet open={cashOpen} onOpenChange={setCashOpen} bundle={bundle} onDone={onChanged} />
      <MoneyMoveSheet account={moveOpen} onClose={() => setMoveOpen(null)} bundle={bundle} onDone={onChanged} />
      <ApproveCashSheet topup={approving} onClose={() => setApproving(null)} onReject={(x) => { setApproving(null); void reject(x); }} bundle={bundle} onDone={onChanged} />
    </div>
  );
}

function ExpenseSheet({ open, onOpenChange, bundle, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; bundle: EventBundle; onDone: () => void }) {
  const { t, lang } = useT();
  const api = useEventsApi();
  const ev = bundle.event;
  const separate = bundle.digitalAccount.mode === 'separate';
  const [category, setCategory] = React.useState<Category>('purchase');
  const [description, setDescription] = React.useState('');
  const [amount, setAmount] = React.useState<number | null>(null);
  const [paidFrom, setPaidFrom] = React.useState<EventExpense['paidFrom']>('event_cash');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (open) { setCategory('purchase'); setDescription(''); setAmount(null); setPaidFrom('event_cash'); setError(null); } }, [open]);

  const save = async () => {
    setError(null);
    if (!amount) return setError(t('money.amount'));
    setBusy(true);
    try {
      const res = await api.submitExpense(ev.id, ev.name, {
        category, description: description.trim() || t(`event.cat.${category}` as I18nKey), amount, date: bundle.today, paidFrom,
      });
      if (res.status === 'kept') toast.info(t('event.savedOnPhone'));
      else toast.success(t('expense.save'));
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('event.addExpense')}
      description={ev.name}
      dirty={!!amount && !busy}
      footer={<Button size="lg" className="w-full" loading={busy} onClick={save}>{t('expense.save')}</Button>}
    >
      <div className="flex flex-col gap-4" lang={lang}>
        {error && <Callout tone="danger" title={error} live />}
        <Field label={t('event.category')}>
          <ChoiceChips aria-label={t('event.category')} value={category} onValueChange={setCategory} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t(`event.cat.${c}` as I18nKey) }))} />
        </Field>
        <Field label={t('event.what')} optional>
          <Input value={description} maxLength={160} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={t('money.amount')} required>
          <MoneyInput value={amount} onValueChange={(n) => setAmount(n)} />
        </Field>
        <Field label={t('event.paidFrom')}>
          <SegmentedControl
            aria-label="Paid from" value={paidFrom}
            onValueChange={setPaidFrom}
            options={[
              { value: 'event_cash', label: t('event.paidFromCash') },
              ...(separate ? [{ value: 'event_digital' as const, label: bundle.digitalAccount.name }] : []),
              { value: 'owner', label: t('event.paidFromOwner') },
            ]}
          />
        </Field>
        {paidFrom === 'event_cash' && <span className="text-caption text-text-3">{`${t('event.cashInHand')}: ₹${bundle.cash.inHand.toLocaleString('en-IN')}`}</span>}
      </div>
    </ResponsiveModal>
  );
}

function AskCashSheet({ open, onOpenChange, bundle, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; bundle: EventBundle; onDone: () => void }) {
  const { t, lang } = useT();
  const api = useEventsApi();
  const [amount, setAmount] = React.useState<number | null>(null);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (open) { setAmount(null); setNote(''); setError(null); } }, [open]);
  const send = async () => {
    setError(null);
    if (!amount) return setError(t('money.amount'));
    setBusy(true);
    try {
      await api.requestCash(bundle.event.id, { requestedAmount: amount, date: bundle.today, note: note.trim() });
      toast.success(t('event.cashAsked'));
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || 'Could not send');
    } finally {
      setBusy(false);
    }
  };
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={t('event.askCash')} description="The owner or an operations manager approves it" footer={<Button size="lg" className="w-full" loading={busy} onClick={send}>{t('common.send')}</Button>}>
      <div className="flex flex-col gap-4" lang={lang}>
        {error && <Callout tone="danger" title={error} live />}
        <Field label={t('money.amount')} required><MoneyInput value={amount} onValueChange={(n) => setAmount(n)} /></Field>
        <Field label={t('event.askCashWhy')}><Input value={note} maxLength={300} placeholder="e.g. Change for the counter, gas cylinder" onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </ResponsiveModal>
  );
}

function ApproveCashSheet({ topup, onClose, onReject, bundle, onDone }: { topup: EventTopup | null; onClose: () => void; onReject: (t: EventTopup) => void; bundle: EventBundle; onDone: () => void }) {
  const api = useEventsApi();
  const [source, setSource] = React.useState<'store_paytm' | 'production_cash'>('store_paytm');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (topup) { setSource('store_paytm'); setError(null); } }, [topup]);
  const approve = async () => {
    if (!topup) return;
    setBusy(true);
    setError(null);
    try {
      await api.approveCash(topup.id, source);
      toast.success('Cash added to the event');
      onDone();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not approve');
    } finally {
      setBusy(false);
    }
  };
  return (
    <ResponsiveModal open={!!topup} onOpenChange={(o) => { if (!o) onClose(); }} title="Approve event cash" description={topup ? `₹${topup.requestedAmount.toLocaleString('en-IN')} for ${bundle.event.name}` : undefined} footer={(
      <div className="flex w-full gap-2">
        <Button variant="secondary" size="lg" disabled={busy} onClick={() => topup && onReject(topup)}>Reject</Button>
        <Button size="lg" className="flex-1" loading={busy} onClick={approve}>Approve</Button>
      </div>
    )}>
      <div className="flex flex-col gap-4">
        {error && <Callout tone="danger" title={error} live />}
        {topup && <p className="text-body text-text-2">{[topup.note, topup.requestedByName].filter(Boolean).join(' · ')}</p>}
        <Field label="Where does the money come from?">
          <SegmentedControl
            aria-label="Where the money comes from" value={source}
            onValueChange={setSource}
            options={[{ value: 'store_paytm', label: `${bundle.store?.name || 'Store'} Paytm` }, { value: 'production_cash', label: `${bundle.productionHouse?.name || 'Production'} cash` }]}
          />
        </Field>
        <span className="text-caption text-text-3">
          {source === 'store_paytm' ? "Comes off the store's Paytm balance (its Paytm ledger shows it)." : "Comes out of the production house's cash in hand."} The event's cash goes up by the same amount.
        </span>
      </div>
    </ResponsiveModal>
  );
}

function MoneyMoveSheet({ account, onClose, bundle, onDone }: { account: null | 'cash' | 'digital'; onClose: () => void; bundle: EventBundle; onDone: () => void }) {
  const api = useEventsApi();
  const [direction, setDirection] = React.useState<'in' | 'out'>('in');
  const [counterparty, setCounterparty] = React.useState<'owner' | 'store' | 'bank' | 'other'>('owner');
  const [amount, setAmount] = React.useState<number | null>(null);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (account) { setDirection(account === 'digital' ? 'out' : 'in'); setCounterparty(account === 'digital' ? 'bank' : 'owner'); setAmount(null); setNote(''); setError(null); } }, [account]);
  const save = async () => {
    if (!account) return;
    setError(null);
    if (!amount) return setError('Enter the amount');
    setBusy(true);
    try {
      await api.addMoney(bundle.event.id, { account, direction, counterparty, amount, date: bundle.today, note: note.trim() });
      toast.success('Saved');
      onDone();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  const isCash = account === 'cash';
  return (
    <ResponsiveModal
      open={!!account}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={isCash ? 'Event cash in / out' : `Transfer out of ${bundle.digitalAccount.name}`}
      footer={<Button size="lg" className="w-full" loading={busy} onClick={save}>Save</Button>}
    >
      <div className="flex flex-col gap-4">
        {error && <Callout tone="danger" title={error} live />}
        {isCash && (
          <SegmentedControl aria-label="In or out" value={direction} onValueChange={setDirection} options={[{ value: 'in', label: 'Float given to the stall' }, { value: 'out', label: 'Handed over' }]} />
        )}
        <Field label={direction === 'in' ? 'Given by' : 'Given to'}>
          <SegmentedControl
            aria-label="Who" value={counterparty}
            onValueChange={setCounterparty}
            options={isCash ? [{ value: 'owner', label: 'Owner' }, { value: 'store', label: bundle.store?.name || 'Store' }] : [{ value: 'bank', label: 'Bank' }, { value: 'owner', label: 'Owner' }, { value: 'other', label: 'Other' }]}
          />
        </Field>
        {isCash && counterparty === 'store' && (
          <Callout tone="info" title="The store's cash changes too">
            {direction === 'in' ? 'Cash taken from the store till.' : 'Cash given to the store till.'} The store incharge should count it in today's store day close.
          </Callout>
        )}
        <Field label="Amount" required><MoneyInput value={amount} onValueChange={(n) => setAmount(n)} /></Field>
        <Field label="Note" optional><Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
        {direction === 'in' && isCash && <span className="text-caption text-text-3">Need cash from the store's Paytm or production's cash? Use "Ask for cash" - it goes for approval.</span>}
      </div>
    </ResponsiveModal>
  );
}
