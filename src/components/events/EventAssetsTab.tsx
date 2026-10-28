// Equipment at the event: items from the assets register checked out to the stall and returned
// at the end, and what's still out. The register keeps each item's home location.
import * as React from 'react';
import { Boxes, CheckCircle2, Plus, Search, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { ListGroup, ListRow } from '../ui/list-row';
import { StatusChip } from '../ui/status-chip';
import { Button } from '../ui/button';
import { ResponsiveModal } from '../ui/responsive-modal';
import { NumberStepper } from '../ui/number-stepper';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { SegmentedControl } from '../ui/segmented-control';
import { Callout } from '../ui/callout';
import { SkeletonListRows } from '../ui/skeleton';
import { useT } from '../../utils/i18n';
import type { EventAssetCheckout, EventBundle, RegisterAsset } from '../../utils/eventsApi';
import { assetsStillOut } from '../../utils/eventRules';
import { shortDate, useEventsApi, useLoad } from './eventsShared';

export function EventAssetsTab({ bundle, onChanged }: { bundle: EventBundle; onChanged: () => void }) {
  const { lang } = useT();
  const p = bundle.permissions;
  const canCheckout = p.canMoveMoney && bundle.event.status !== 'closed';
  const canReturn = (p.canRunStock || p.isIncharge) && bundle.event.status !== 'closed';
  const [pickOpen, setPickOpen] = React.useState(false);
  const [returning, setReturning] = React.useState<EventAssetCheckout | null>(null);
  const out = assetsStillOut(bundle.assets) as EventAssetCheckout[];
  const back = bundle.assets.filter((a) => a.quantity - (a.returnedQty || 0) <= 0);

  return (
    <div className="flex flex-col gap-5" lang={lang}>
      {canCheckout && <Button size="lg" leadingIcon={<Plus />} onClick={() => setPickOpen(true)}>Take equipment to the event</Button>}
      {bundle.event.status === 'ended' && out.length > 0 && <Callout tone="warning" title={`${out.length} item${out.length === 1 ? '' : 's'} still at the event`}>Return them before the event is closed.</Callout>}

      <ListGroup title="At the event now" empty="Nothing checked out">
        {out.map((a) => (
          <ListRow
            key={a.id}
            icon={Boxes}
            title={a.assetName}
            subtitle={`${a.quantity - (a.returnedQty || 0)} of ${a.quantity} out · since ${shortDate(a.outAt.slice(0, 10), lang)} · ${a.outBy}`}
            trailing={canReturn ? <Button size="sm" variant="secondary" leadingIcon={<Undo2 />} onClick={() => setReturning(a)}>Return</Button> : <StatusChip tone="warning" size="sm">Out</StatusChip>}
          />
        ))}
      </ListGroup>

      {back.length > 0 && (
        <ListGroup title="Returned">
          {back.map((a) => (
            <ListRow
              key={a.id}
              density="compact"
              icon={CheckCircle2}
              iconTone="success"
              title={a.assetName}
              subtitle={`${a.quantity} back${a.returnCondition && a.returnCondition !== 'good' ? ` · ${a.returnCondition.replace('_', ' ')}` : ''}`}
            />
          ))}
        </ListGroup>
      )}

      <CheckoutSheet open={pickOpen} onOpenChange={setPickOpen} bundle={bundle} onDone={onChanged} />
      <ReturnSheet checkout={returning} onClose={() => setReturning(null)} bundle={bundle} onDone={onChanged} />
    </div>
  );
}

function CheckoutSheet({ open, onOpenChange, bundle, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; bundle: EventBundle; onDone: () => void }) {
  const api = useEventsApi();
  const ev = bundle.event;
  const [query, setQuery] = React.useState('');
  const [picked, setPicked] = React.useState<RegisterAsset | null>(null);
  const [qty, setQty] = React.useState(1);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const list = useLoad(async () => (open ? api.registerAssets() : []), [open]);
  React.useEffect(() => { if (open) { setPicked(null); setQuery(''); setQty(1); setError(null); } }, [open]);
  const available = (a: RegisterAsset) => Math.max(0, (a.quantity || 1) - (a.atEvents || []).reduce((s, x) => s + x.quantity, 0));
  // The parent store's and production house's equipment first.
  const home = (a: RegisterAsset) => a.locationId === ev.parentStoreId || a.locationId === ev.productionHouseId;
  const items = (list.data || [])
    .filter((a) => a.condition !== 'disposed' && (!query || a.name.toLowerCase().includes(query.toLowerCase())))
    .sort((x, y) => Number(home(y)) - Number(home(x)) || x.name.localeCompare(y.name));

  const save = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await api.checkoutAsset(ev.id, { assetId: picked.id, quantity: qty });
      toast.success(`${picked.name} checked out`);
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || 'Could not check out');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={picked ? picked.name : 'Take equipment'}
      onBack={picked ? () => setPicked(null) : undefined}
      footer={picked ? <Button size="lg" className="w-full" loading={busy} onClick={save}>Check out</Button> : undefined}
    >
      {error && <Callout tone="danger" title={error} live className="mb-3" />}
      {picked ? (
        <Field label="How many" helper={`${available(picked)} available`}>
          <NumberStepper label="How many" value={qty} min={1} max={Math.max(1, available(picked))} onChange={setQty} />
        </Field>
      ) : (
        <div className="flex flex-col gap-3">
          <Input leading={<Search className="size-4 text-text-3" aria-hidden="true" />} placeholder="Search equipment" value={query} onChange={(e) => setQuery(e.target.value)} />
          {list.loading ? <SkeletonListRows count={4} /> : (
            <ListGroup empty="No equipment in the register">
              {items.map((a) => (
                <ListRow
                  key={a.id}
                  icon={Boxes}
                  title={a.name}
                  subtitle={`${available(a)} of ${a.quantity} available${(a.atEvents || []).length ? ` · ${(a.atEvents || []).map((x) => `${x.quantity} at ${x.eventName}`).join(', ')}` : ''}`}
                  disabled={available(a) < 1}
                  onClick={available(a) > 0 ? () => { setPicked(a); setQty(1); } : undefined}
                />
              ))}
            </ListGroup>
          )}
        </div>
      )}
    </ResponsiveModal>
  );
}

function ReturnSheet({ checkout, onClose, bundle, onDone }: { checkout: EventAssetCheckout | null; onClose: () => void; bundle: EventBundle; onDone: () => void }) {
  const api = useEventsApi();
  const left = checkout ? checkout.quantity - (checkout.returnedQty || 0) : 0;
  const [qty, setQty] = React.useState(1);
  const [condition, setCondition] = React.useState<'good' | 'needs_repair' | 'broken'>('good');
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (checkout) { setQty(left); setCondition('good'); setNote(''); setError(null); } }, [checkout, left]);
  const save = async () => {
    if (!checkout) return;
    setBusy(true);
    setError(null);
    try {
      await api.returnAsset(bundle.event.id, checkout.id, { quantity: qty, condition, note });
      toast.success('Return recorded');
      onDone();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  return (
    <ResponsiveModal open={!!checkout} onOpenChange={(o) => { if (!o) onClose(); }} title={checkout ? `Return ${checkout.assetName}` : 'Return'} footer={<Button size="lg" className="w-full" loading={busy} onClick={save}>Save return</Button>}>
      <div className="flex flex-col gap-4">
        {error && <Callout tone="danger" title={error} live />}
        <Field label="How many came back" helper={`${left} still out`}>
          <NumberStepper label="How many came back" value={qty} min={1} max={Math.max(1, left)} onChange={setQty} />
        </Field>
        <Field label="Condition">
          <SegmentedControl aria-label="Condition" value={condition} onValueChange={setCondition} options={[{ value: 'good', label: 'Good' }, { value: 'needs_repair', label: 'Needs repair' }, { value: 'broken', label: 'Broken' }]} />
        </Field>
        <Field label="Note" optional><Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </ResponsiveModal>
  );
}
