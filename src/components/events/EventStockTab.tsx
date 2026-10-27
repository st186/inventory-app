// Stock at the stall: momos from the production house (requested like a store's, shipped by
// production, counted in here), items moved from the parent store (or back), and what's left.
import * as React from 'react';
import { ArrowLeftRight, PackageCheck, Plus, Store, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { ListGroup, ListRow } from '../ui/list-row';
import { StatusChip } from '../ui/status-chip';
import { Button } from '../ui/button';
import { ResponsiveModal } from '../ui/responsive-modal';
import { NumberStepper } from '../ui/number-stepper';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { MoneyInput } from '../ui/money';
import { SegmentedControl } from '../ui/segmented-control';
import { IconButton } from '../ui/icon-button';
import { ChoiceChips } from '../ui/chip';
import { Callout } from '../ui/callout';
import { MonthCalendar } from '../ui/month-calendar';
import { useT } from '../../utils/i18n';
import type { EventBundle, EventStockRequest } from '../../utils/eventsApi';
import { addDaysISO, receivedRequestPieces, shippedRequestPieces, requestPieces, type EventMomoKey } from '../../utils/eventRules';
import { currentAccessToken } from '../../utils/accessToken';
import { MOMO_KEYS, momoLabel, shortDate, useEventsApi } from './eventsShared';

const ReceiveDeliveryDialog = React.lazy(() => import('../dispatch/ReceiveDeliveryDialog').then((m) => ({ default: m.ReceiveDeliveryDialog })));

const STATUS_CHIP: Record<string, { status: 'request.sent' | 'request.packed' | 'request.onTheWay' | 'request.received' }> = {
  pending: { status: 'request.sent' }, accepted: { status: 'request.sent' }, 'in-preparation': { status: 'request.packed' }, prepared: { status: 'request.packed' },
  shipped: { status: 'request.onTheWay' }, 'partially-shipped': { status: 'request.onTheWay' }, delivered: { status: 'request.received' }, 'partially-delivered': { status: 'request.received' },
};
const TRANSFER_CATEGORIES = [
  { value: 'sauces', label: 'Sauces' }, { value: 'packaging', label: 'Packaging' }, { value: 'supplies', label: 'Supplies' },
  { value: 'beverages', label: 'Drinks' }, { value: 'gas_fuel', label: 'Gas / fuel' }, { value: 'other', label: 'Other' },
];

export function EventStockTab({ bundle, onChanged }: { bundle: EventBundle; onChanged: () => void }) {
  const { t, lang } = useT();
  const ev = bundle.event;
  const p = bundle.permissions;
  const canRequest = ev.status !== 'closed' && (p.canRunStock || (p.isIncharge && p.canEnter));
  const [requestOpen, setRequestOpen] = React.useState(false);
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [receiving, setReceiving] = React.useState<EventStockRequest | null>(null);
  const [token, setToken] = React.useState('');
  const products = MOMO_KEYS.map((k) => ({ camelKey: k, label: momoLabel(k, 'en') }));

  const openReceive = async (r: EventStockRequest) => {
    setToken((await currentAccessToken().catch(() => '')) || '');
    setReceiving(r);
  };

  const momos = bundle.stock.momos;
  // One primary action: counting a delivery that has arrived wins over asking for more.
  const incoming = bundle.requests.some((r) => r.status === 'shipped' || r.status === 'partially-shipped');
  const totalLeft = MOMO_KEYS.reduce((s, k) => s + (momos[k]?.left || 0), 0);
  const pieces = (r: EventStockRequest) => MOMO_KEYS.reduce((s, k) => s + (r.receipt ? receivedRequestPieces(r, k) : r.shippedQuantities ? shippedRequestPieces(r, k) : requestPieces(r, k)), 0);

  return (
    <div className="flex flex-col gap-5" lang={lang}>
      {canRequest && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button size="lg" variant={incoming ? 'secondary' : 'primary'} leadingIcon={<Plus />} onClick={() => setRequestOpen(true)}>{t('event.requestMomos')}</Button>
          <Button size="lg" variant="secondary" leadingIcon={<Store />} onClick={() => setMoveOpen(true)}>Move items from the store</Button>
        </div>
      )}

      <ListGroup title={t('event.left')} meta={<span className="num text-label text-text-2">{totalLeft.toLocaleString('en-IN')} {t('event.pieces')}</span>}>
        {MOMO_KEYS.filter((k) => momos[k] && (momos[k].received || momos[k].inTransit || momos[k].sold)).map((k) => (
          <ListRow
            key={k}
            density="compact"
            title={momoLabel(k, lang)}
            subtitle={`${t('event.received')} ${momos[k].received} · ${t('event.sold')} ${momos[k].sold}${momos[k].inTransit ? ` · ${momos[k].inTransit} on the way` : ''}`}
            trailing={momos[k].sold + momos[k].wasted > momos[k].received
              ? <StatusChip tone="warning" size="sm">Check counts</StatusChip>
              : <span className="num text-body-md font-semibold">{momos[k].left}</span>}
          />
        ))}
        {MOMO_KEYS.every((k) => !momos[k] || (!momos[k].received && !momos[k].inTransit && !momos[k].sold)) && (
          <ListRow density="compact" title={t('event.nothingYet')} subtitle="Momos sent by production show here once counted in" />
        )}
      </ListGroup>

      <ListGroup title="Momo requests">
        {bundle.requests.length === 0 && <ListRow density="compact" title={t('event.nothingYet')} />}
        {bundle.requests.map((r) => {
          const onTheWay = r.status === 'shipped' || r.status === 'partially-shipped';
          return (
            <ListRow
              key={r.id}
              icon={onTheWay ? Truck : PackageCheck}
              title={`${shortDate(String(r.requestDate).slice(0, 10), lang)} · ${pieces(r).toLocaleString('en-IN')} ${t('event.pieces')}`}
              subtitle={MOMO_KEYS.filter((k) => requestPieces(r, k)).map((k) => `${momoLabel(k, lang)} ${requestPieces(r, k)}`).join(' · ')}
              trailing={onTheWay && p.canEnter
                ? <Button size="sm" onClick={() => openReceive(r)}>{t('event.countDelivery')}</Button>
                : STATUS_CHIP[r.status] ? <StatusChip status={STATUS_CHIP[r.status].status} size="sm" /> : <StatusChip size="sm">{r.status}</StatusChip>}
            />
          );
        })}
      </ListGroup>

      <ListGroup title="Items from the store" meta={<span className="num text-label text-text-2">{`₹${bundle.stock.items.reduce((s, i) => s + i.value, 0).toLocaleString('en-IN')}`}</span>}>
        {bundle.stock.items.length === 0 && <ListRow density="compact" title={t('event.nothingYet')} subtitle="Sauces, packaging and supplies taken from the store" />}
        {bundle.stock.items.map((i) => (
          <ListRow key={i.itemName} density="compact" title={i.itemName} subtitle={`₹${i.value.toLocaleString('en-IN')} at cost`} trailing={<span className="num text-body-md font-semibold">{`${i.quantity} ${i.unit}`}</span>} />
        ))}
      </ListGroup>
      {bundle.transfers.length > 0 && (
        <ListGroup title="Moves">
          {bundle.transfers.map((m) => (
            <ListRow
              key={m.id}
              density="compact"
              icon={ArrowLeftRight}
              title={`${m.direction === 'to_store' ? 'Back to the store' : 'From the store'} · ${shortDate(m.date, lang)}`}
              subtitle={m.items.map((i) => `${i.itemName} ${i.quantity} ${i.unit}`).join(', ')}
              amount={m.direction === 'to_store' ? -m.totalCost : m.totalCost}
            />
          ))}
        </ListGroup>
      )}

      <RequestMomosSheet open={requestOpen} onOpenChange={setRequestOpen} bundle={bundle} onDone={onChanged} />
      <MoveItemsSheet open={moveOpen} onOpenChange={setMoveOpen} bundle={bundle} onDone={onChanged} />
      {receiving && (
        <React.Suspense fallback={null}>
          <ReceiveDeliveryDialog
            request={receiving as any}
            products={products}
            accessToken={token}
            onClose={() => setReceiving(null)}
            onReceived={() => { setReceiving(null); toast.success(t('event.received')); onChanged(); }}
          />
        </React.Suspense>
      )}
    </div>
  );
}

function RequestMomosSheet({ open, onOpenChange, bundle, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; bundle: EventBundle; onDone: () => void }) {
  const { t, lang } = useT();
  const api = useEventsApi();
  const ev = bundle.event;
  const firstDay = bundle.today < ev.startDate ? ev.startDate : bundle.today;
  const [date, setDate] = React.useState(firstDay);
  const [picking, setPicking] = React.useState(false);
  const [q, setQ] = React.useState<Partial<Record<EventMomoKey, number>>>({});
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (open) { setDate(firstDay); setQ({}); setNotes(''); setError(null); setPicking(false); } }, [open, firstDay]);
  const total = MOMO_KEYS.reduce((s, k) => s + (q[k] || 0), 0);

  const send = async () => {
    setError(null);
    if (!total) return setError('Enter how many momos you need');
    setBusy(true);
    try {
      await api.requestStock(ev.id, { requestDate: date, quantities: q, notes });
      toast.success(t('request.send'));
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || 'Could not send the request');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={picking ? t('event.momosFor') : t('event.requestMomos')}
      description={bundle.productionHouse ? `To ${bundle.productionHouse.name}` : undefined}
      onBack={picking ? () => setPicking(false) : undefined}
      dirty={total > 0 && !busy}
      footer={picking ? undefined : <Button size="lg" className="w-full" loading={busy} onClick={send}>{`${t('request.send')}${total ? ` · ${total} ${t('event.pieces')}` : ''}`}</Button>}
    >
      {picking ? (
        <MonthCalendar value={date} min={addDaysISO(ev.startDate, -2)} max={ev.endDate} today={bundle.today} onSelect={(d) => { setDate(d); setPicking(false); }} />
      ) : (
        <div className="flex flex-col gap-4" lang={lang}>
          {error && <Callout tone="danger" title={error} live />}
          <Field label={t('event.momosFor')}>
            <Button variant="secondary" onClick={() => setPicking(true)}>{shortDate(date, lang)}</Button>
          </Field>
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {MOMO_KEYS.map((k) => (
              <div key={k} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-body-md">{momoLabel(k, lang)}</span>
                <NumberStepper label={momoLabel(k, lang)} value={q[k] || 0} min={0} max={20000} step={10} editable unit={t('event.pieces')} onChange={(v) => setQ((x) => ({ ...x, [k]: v }))} />
              </div>
            ))}
          </div>
          <Field label={t('event.notes')} optional>
            <Textarea value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="Sauces, packets or anything else to send along" />
          </Field>
        </div>
      )}
    </ResponsiveModal>
  );
}

type ItemDraft = { itemName: string; quantity: number | null; unit: string; category: string; unitCost: number | null };
const blankItem = (): ItemDraft => ({ itemName: '', quantity: null, unit: 'pcs', category: 'sauces', unitCost: null });

function MoveItemsSheet({ open, onOpenChange, bundle, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; bundle: EventBundle; onDone: () => void }) {
  const api = useEventsApi();
  const ev = bundle.event;
  const [direction, setDirection] = React.useState<'to_event' | 'to_store'>('to_event');
  const [items, setItems] = React.useState<ItemDraft[]>([blankItem()]);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (open) { setDirection('to_event'); setItems([blankItem()]); setNote(''); setError(null); } }, [open]);
  const setItem = (i: number, patch: Partial<ItemDraft>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    setError(null);
    const ready = items.filter((x) => x.itemName.trim() && x.quantity);
    if (!ready.length) return setError('Add at least one item with a quantity');
    setBusy(true);
    try {
      await api.addTransfer(ev.id, {
        direction, date: bundle.today, note,
        items: ready.map((x) => ({ itemName: x.itemName.trim(), quantity: x.quantity!, unit: x.unit, category: x.category, unitCost: x.unitCost })),
      });
      toast.success(direction === 'to_event' ? 'Items moved to the event' : 'Items back at the store');
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
      title={direction === 'to_event' ? 'Move items from the store' : 'Bring items back to the store'}
      description={bundle.store?.name}
      dirty={items.some((x) => x.itemName) && !busy}
      footer={<Button size="lg" className="w-full" loading={busy} onClick={save}>Save</Button>}
    >
      <div className="flex flex-col gap-4">
        {error && <Callout tone="danger" title={error} live />}
        <SegmentedControl aria-label="Direction" value={direction} onValueChange={setDirection} options={[{ value: 'to_event', label: 'Store to event' }, { value: 'to_store', label: 'Event to store' }]} />
        <span className="text-caption text-text-3">
          {direction === 'to_event'
            ? "Taken off the store's stock and counted in the event's costs at the store's last purchase price (or the cost you enter)."
            : "Back on the store's stock and off the event's costs."}
        </span>
        {items.map((x, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-end gap-2">
              <Field label="Item" className="flex-1">
                <Input value={x.itemName} maxLength={80} placeholder="e.g. Momo box, Red chutney" onChange={(e) => setItem(i, { itemName: e.target.value })} />
              </Field>
              {items.length > 1 && <IconButton label="Remove item" icon={<Trash2 />} variant="danger-ghost" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} />}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Quantity">
                <Input inputMode="decimal" value={x.quantity ?? ''} onChange={(e) => setItem(i, { quantity: Number(e.target.value) || null })} />
              </Field>
              <Field label="Unit">
                <Input value={x.unit} maxLength={20} onChange={(e) => setItem(i, { unit: e.target.value })} />
              </Field>
            </div>
            <ChoiceChips aria-label="Kind of item" value={x.category} onValueChange={(v) => setItem(i, { category: v })} options={TRANSFER_CATEGORIES} />
            <Field label="Cost per unit" optional helper="Left empty: the store's last purchase price">
              <MoneyInput value={x.unitCost} onValueChange={(n) => setItem(i, { unitCost: n })} />
            </Field>
          </div>
        ))}
        <Button variant="secondary" leadingIcon={<Plus />} onClick={() => setItems((xs) => [...xs, blankItem()])}>Add another item</Button>
        <Field label="Note" optional>
          <Textarea value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </ResponsiveModal>
  );
}
