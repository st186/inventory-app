// Create or edit an event (the cluster head): name, dates, venue and map pin, rent, the store it
// belongs to, the production house, staff and the incharge, where digital payments go, and an
// optional Ciferon outlet. Sub-views (dates, staff, pin) replace the form inside the same sheet.
import * as React from 'react';
import { CalendarDays, Check, MapPin, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ResponsiveModal } from '../ui/responsive-modal';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { MoneyInput } from '../ui/money';
import { SegmentedControl } from '../ui/segmented-control';
import { PickerField } from '../ui/picker-sheet';
import { MonthCalendar } from '../ui/month-calendar';
import { ListGroup, ListRow } from '../ui/list-row';
import { Checkbox } from '../ui/checkbox';
import { Callout } from '../ui/callout';
import { SkeletonListRows } from '../ui/skeleton';
import type { EventInput, EventRecord, PickOption } from '../../utils/eventsApi';
import { datesBetween } from '../../utils/eventRules';
import { dateRange, shortDate, useEventsApi, useEventsToday, useLoad } from './eventsShared';

const LocationPicker = React.lazy(() => import('../LocationPicker').then((m) => ({ default: m.LocationPicker })));

type View = 'form' | 'start' | 'end' | 'staff' | 'pin';
type Draft = {
  name: string; venue: string; startDate: string; endDate: string;
  parentStoreId: string; productionHouseId: string;
  lat: number | null; lng: number | null; radiusM: number;
  rentMode: 'total' | 'per_day'; rentAmount: number | null;
  staffIds: string[]; inchargeId: string;
  digitalMode: 'separate' | 'store_paytm'; digitalName: string;
  ciferonStoreId: string; notes: string;
};

const fromEvent = (ev: EventRecord | null, today: string): Draft => ({
  name: ev?.name || '', venue: ev?.venue || '', startDate: ev?.startDate || today, endDate: ev?.endDate || today,
  parentStoreId: ev?.parentStoreId || '', productionHouseId: ev?.productionHouseId || '',
  lat: ev?.lat ?? null, lng: ev?.lng ?? null, radiusM: ev?.radiusM || 150,
  rentMode: ev?.rent?.mode || 'total', rentAmount: ev?.rent?.amount ?? null,
  staffIds: ev?.staffIds || [], inchargeId: ev?.inchargeId || '',
  // A new event defaults to its own account; with no name it falls back to the store's Paytm.
  digitalMode: ev?.digital?.mode || 'separate', digitalName: ev?.digital?.name || '',
  ciferonStoreId: ev?.ciferonStoreId || '', notes: ev?.notes || '',
});

export function EventFormSheet({ open, onOpenChange, event, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: EventRecord | null; // editing when set
  onSaved: (event: EventRecord) => void;
}) {
  const api = useEventsApi();
  const today = useEventsToday();
  const [draft, setDraft] = React.useState<Draft>(() => fromEvent(event || null, today));
  const [view, setView] = React.useState<View>('form');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const initial = React.useRef(JSON.stringify(fromEvent(event || null, today)));

  React.useEffect(() => {
    if (!open) return;
    const d = fromEvent(event || null, today);
    initial.current = JSON.stringify(d);
    setDraft(d);
    setView('form');
    setError(null);
  }, [open, event, today]);

  const lists = useLoad(async () => {
    if (!open) return null;
    const [stores, houses, people] = await Promise.all([api.stores(), api.productionHouses(), api.people()]);
    return { stores, houses, people };
  }, [open]);
  const stores = lists.data?.stores || [];
  const houses = lists.data?.houses || [];
  const people = lists.data?.people || [];

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = JSON.stringify(draft) !== initial.current;
  const days = datesBetween(draft.startDate, draft.endDate).length;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name || id;

  const pickStore = (id: string) => {
    const store = stores.find((s) => s.id === id);
    setDraft((d) => ({ ...d, parentStoreId: id, productionHouseId: d.productionHouseId || store?.productionHouseId || '' }));
  };

  const save = async () => {
    setError(null);
    if (!draft.name.trim()) return setError('Give the event a name');
    if (!draft.parentStoreId) return setError('Choose the store this event belongs to');
    if (draft.endDate < draft.startDate) return setError('The last day is before the first day');
    const input: EventInput = {
      name: draft.name.trim(), venue: draft.venue.trim(), startDate: draft.startDate, endDate: draft.endDate,
      parentStoreId: draft.parentStoreId, productionHouseId: draft.productionHouseId || null,
      lat: draft.lat, lng: draft.lng, radiusM: draft.radiusM,
      rent: { mode: draft.rentMode, amount: draft.rentAmount || 0 },
      staffIds: draft.staffIds, inchargeId: draft.inchargeId || null,
      digital: { mode: draft.digitalMode, name: draft.digitalName.trim() },
      ciferonStoreId: draft.ciferonStoreId.trim() || null, notes: draft.notes.trim(),
    };
    setSaving(true);
    try {
      const res = event ? await api.update(event.id, input) : await api.create(input);
      toast.success(event ? 'Event saved' : 'Event created');
      onSaved(res.event);
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || 'Could not save the event');
    } finally {
      setSaving(false);
    }
  };

  const titles: Record<View, string> = {
    form: event ? 'Edit event' : 'New event', start: 'First day', end: 'Last day', staff: 'Staff at the event', pin: 'Where is the stall?',
  };
  const back = view === 'form' ? undefined : () => setView('form');
  const filtered = people.filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()) || p.id.toLowerCase().includes(query.toLowerCase()));

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={titles[view]}
      onBack={back}
      dirty={dirty && !saving}
      footer={view === 'form' ? (
        <div className="flex w-full gap-2">
          <Button variant="secondary" size="lg" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="lg" className="flex-1" loading={saving} onClick={save}>{event ? 'Save event' : 'Create event'}</Button>
        </div>
      ) : view === 'staff' || view === 'pin' ? (
        <Button size="lg" className="w-full" onClick={() => setView('form')}>Done</Button>
      ) : undefined}
    >
      {view === 'form' && (
        <div className="flex flex-col gap-4">
          {error && <Callout tone="danger" title={error} live />}
          <Field label="Event name" required>
            <Input value={draft.name} maxLength={80} placeholder="e.g. Durgapur Winter Fair" onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Venue" optional>
            <Input value={draft.venue} maxLength={160} placeholder="Ground, hall or address" onChange={(e) => set('venue', e.target.value)} />
          </Field>
          <Field label="Dates" helper={`${days} day${days === 1 ? '' : 's'}`}>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" leadingIcon={<CalendarDays />} onClick={() => setView('start')}>{shortDate(draft.startDate)}</Button>
              <Button variant="secondary" leadingIcon={<CalendarDays />} onClick={() => setView('end')}>{shortDate(draft.endDate)}</Button>
            </div>
          </Field>
          <Field label="Stall location" helper="Staff check in here on event days" optional>
            <Button variant="secondary" leadingIcon={<MapPin />} onClick={() => setView('pin')} className="justify-start">
              {draft.lat != null && draft.lng != null ? `Pinned · ${draft.lat.toFixed(4)}, ${draft.lng.toFixed(4)}` : 'Put a pin on the map'}
            </Button>
          </Field>

          <Field label="Rent">
            <div className="flex flex-col gap-2">
              <SegmentedControl
                aria-label="How rent is charged" value={draft.rentMode}
                onValueChange={(v) => set('rentMode', v)}
                options={[{ value: 'total', label: 'Total for the event' }, { value: 'per_day', label: 'Per day' }]}
              />
              <MoneyInput value={draft.rentAmount} onValueChange={(n) => set('rentAmount', n)} aria-label="Rent amount" />
              {draft.rentMode === 'per_day' && (draft.rentAmount || 0) > 0 && (
                <span className="text-caption text-text-3">{`₹${((draft.rentAmount || 0) * days).toLocaleString('en-IN')} for ${days} days`}</span>
              )}
            </div>
          </Field>

          {lists.loading && !lists.data ? <SkeletonListRows count={2} /> : (
            <>
              <Field label="Store it belongs to" required helper="Its stock, Paytm and team the event draws on">
                <PickerField
                  title="Store it belongs to"
                  placeholder="Choose the store"
                  value={draft.parentStoreId}
                  onValueChange={(v) => pickStore(v)}
                  items={stores.map((s) => ({ value: s.id, label: s.name }))}
                />
              </Field>
              <Field label="Production house" helper="Sends the momos">
                <PickerField
                  title="Production house"
                  placeholder="Choose the production house"
                  value={draft.productionHouseId}
                  onValueChange={(v) => set('productionHouseId', v)}
                  items={houses.map((h: PickOption) => ({ value: h.id, label: h.name }))}
                />
              </Field>
            </>
          )}

          <Field label="Staff" helper={draft.staffIds.length ? draft.staffIds.map(nameOf).join(', ') : 'Nobody yet'}>
            <Button variant="secondary" leadingIcon={<Users />} onClick={() => setView('staff')} className="justify-start">
              {draft.staffIds.length ? `${draft.staffIds.length} chosen · change` : 'Choose staff'}
            </Button>
          </Field>
          {draft.staffIds.length > 0 && (
            <Field label="Event incharge" helper="Sends the day close and asks for stock and cash">
              <PickerField
                title="Event incharge"
                placeholder="Choose one of the staff"
                value={draft.inchargeId}
                onValueChange={(v) => set('inchargeId', v)}
                items={draft.staffIds.map((id) => ({ value: id, label: nameOf(id) }))}
              />
            </Field>
          )}

          <Field label="Digital payments go to">
            <div className="flex flex-col gap-2">
              <SegmentedControl
                aria-label="Where digital payments go" value={draft.digitalMode}
                onValueChange={(v) => set('digitalMode', v)}
                options={[{ value: 'separate', label: 'Separate account' }, { value: 'store_paytm', label: "Store's Paytm" }]}
              />
              {draft.digitalMode === 'separate' ? (
                <>
                  <Input value={draft.digitalName} maxLength={40} placeholder="Account name, e.g. PhonePe" onChange={(e) => set('digitalName', e.target.value)} />
                  <span className="text-caption text-text-3">
                    {draft.digitalName.trim()
                      ? `Its own ledger on the event page; the store's Paytm is not touched.`
                      : `Until the account has a name, collections go to the store's Paytm.`}
                  </span>
                </>
              ) : (
                <span className="text-caption text-text-3">Collections roll into the store's Paytm ledger.</span>
              )}
            </div>
          </Field>

          <Field label="Ciferon outlet id" optional helper="Only if the stall has its own POS outlet - its sales then sync each night">
            <Input value={draft.ciferonStoreId} maxLength={40} inputMode="numeric" onChange={(e) => set('ciferonStoreId', e.target.value)} />
          </Field>
          <Field label="Notes" optional>
            <Textarea value={draft.notes} maxLength={500} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      )}

      {(view === 'start' || view === 'end') && (
        <div className="flex flex-col gap-3 pb-2">
          <span className="text-body-sm text-text-2">{dateRange(draft.startDate, draft.endDate)}</span>
          <MonthCalendar
            value={view === 'start' ? draft.startDate : draft.endDate}
            rangeFrom={draft.startDate}
            rangeTo={draft.endDate}
            min={view === 'end' ? draft.startDate : undefined}
            today={today}
            onSelect={(d) => {
              if (view === 'start') setDraft((x) => ({ ...x, startDate: d, endDate: x.endDate < d ? d : x.endDate }));
              else set('endDate', d);
              setView('form');
            }}
          />
        </div>
      )}

      {view === 'staff' && (
        <div className="flex flex-col gap-3">
          <Input leading={<Search className="size-4 text-text-3" aria-hidden="true" />} placeholder="Search staff" value={query} onChange={(e) => setQuery(e.target.value)} />
          <ListGroup>
            {filtered.map((p) => {
              const on = draft.staffIds.includes(p.id);
              const toggle = () => setDraft((d) => {
                const staffIds = on ? d.staffIds.filter((x) => x !== p.id) : [...d.staffIds, p.id];
                return { ...d, staffIds, inchargeId: staffIds.includes(d.inchargeId) ? d.inchargeId : '' };
              });
              return (
                <ListRow
                  key={p.id}
                  title={p.name}
                  subtitle={[p.id, p.designation?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}
                  leading={<Checkbox checked={on} onCheckedChange={toggle} aria-label={p.name} />}
                  trailing={draft.inchargeId === p.id ? <span className="flex items-center gap-1 text-label text-text-2"><Check className="size-4" aria-hidden="true" />Incharge</span> : undefined}
                  onClick={toggle}
                  chevron={false}
                />
              );
            })}
          </ListGroup>
        </div>
      )}

      {view === 'pin' && (
        <div className="flex flex-col gap-3">
          <React.Suspense fallback={<SkeletonListRows count={3} />}>
            <LocationPicker
              value={draft.lat != null && draft.lng != null ? { latitude: draft.lat, longitude: draft.lng } : null}
              onChange={(p) => setDraft((d) => ({ ...d, lat: p.latitude, lng: p.longitude }))}
              height={300}
            />
          </React.Suspense>
          <Field label="Check-in radius" helper="How far from the pin still counts as at the stall">
            <SegmentedControl
              aria-label="Check-in radius" value={String(draft.radiusM)}
              onValueChange={(v) => set('radiusM', Number(v))}
              options={[{ value: '100', label: '100 m' }, { value: '150', label: '150 m' }, { value: '250', label: '250 m' }, { value: '400', label: '400 m' }]}
            />
          </Field>
        </div>
      )}
    </ResponsiveModal>
  );
}
