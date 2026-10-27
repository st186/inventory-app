// Dispatch: call a rider in, in one sheet - ride type, rider, store (or, for a custom ride, where
// it starts and ends), the stock requests it carries, the fare and a note. A new one-off place
// (an event stall, say) is pinned in the same sheet: the form swaps to the map with a back arrow
// and a "Use this place" button. Same checks and the same POST /rider/trips as before; the
// choices stay put between calls, only the note is cleared.
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Check, Factory, MapPin, Pencil, Store } from 'lucide-react';
import { toast } from '../ui/sonner';
import type { RiderListItem, RiderPlace, RiderTrip, RiderTripType } from '../../utils/api';
import type { PickedLocation } from '../LocationPicker';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { ChoiceChips } from '../ui/chip';
import { confirm } from '../ui/confirm';
import { EmptyState } from '../ui/empty-state';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { MoneyInput, formatINR } from '../ui/money';
import { ResponsiveModal } from '../ui/responsive-modal';
import { StatusChip } from '../ui/status-chip';
import { cn } from '../ui/utils';
import type { I18nKey } from '../../utils/i18n';
import { LocationPicker, MapPlaceholder } from './mapLazy';
import { useRiderApi } from './riderApi';
import { useRideWords } from './rideWords';
import { TRIP_TYPES, isShipped, openRequestsFor, wholeRupees, type RideRequest } from './tripUtils';

type End = 'pickup' | 'drop';

export function CallRiderSheet({ open, onOpenChange, riders, places, stores, defaultStoreId, stockRequests, presetRiderId, onCalled }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riders: RiderListItem[];
  places: RiderPlace[];
  stores: { id: string; name: string }[];
  defaultStoreId: string | null;
  stockRequests: RideRequest[];
  /** Opened from a rider's row: that rider is chosen. */
  presetRiderId?: string | null;
  onCalled: (trip: RiderTrip) => void;
}) {
  const rapi = useRiderApi();
  const w = useRideWords();
  const [riderId, setRiderId] = useState('');
  const [tripType, setTripType] = useState<RiderTripType>('to_store');
  const [fareInput, setFareInput] = useState('');
  // Custom rides: each end is a production house, a store, or a one-off location (e.g. an event stall).
  const [pickupChoice, setPickupChoice] = useState('');
  const [dropChoice, setDropChoice] = useState('custom');
  const [customName, setCustomName] = useState<Record<End, string>>({ pickup: '', drop: '' });
  const [customLoc, setCustomLoc] = useState<Record<End, PickedLocation | null>>({ pickup: null, drop: null });
  // Stock requests this ride is carrying (ticked ones are linked to the ride).
  const [linkedRequestIds, setLinkedRequestIds] = useState<Set<string>>(new Set());
  const [storeId, setStoreId] = useState(defaultStoreId || '');
  const [note, setNote] = useState('');
  const [calling, setCalling] = useState(false);
  // Pinning a new place: the sheet shows the map for this end instead of the form.
  const [pinning, setPinning] = useState<End | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftLoc, setDraftLoc] = useState<PickedLocation | null>(null);

  const selectRider = (r: RiderListItem) => {
    setRiderId(r.employeeId);
    setFareInput(r.defaultRate ? String(r.defaultRate) : '');
  };

  // One rider: chosen straight away (with their rate), as before.
  useEffect(() => {
    if (!riderId && riders.length === 1) selectRider(riders[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riders]);
  useEffect(() => {
    if (!open || !presetRiderId) return;
    const r = riders.find((x) => x.employeeId === presetRiderId);
    if (r) selectRider(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetRiderId]);
  useEffect(() => {
    if (!storeId && stores.length === 1) setStoreId(stores[0].id);
  }, [stores, storeId]);
  useEffect(() => { if (!open) setPinning(null); }, [open]);

  // Open stock requests for the chosen store that a delivery ride could be carrying; pre-tick the
  // ones production has already shipped - those are what a rider carries.
  const openRequests = useMemo(() => openRequestsFor(stockRequests, storeId, tripType), [stockRequests, storeId, tripType]);
  useEffect(() => {
    setLinkedRequestIds(new Set(openRequests.filter((r) => isShipped(r.status)).map((r) => r.id)));
  }, [openRequests]);

  const placeOptions = useMemo(() => [
    ...places.map((pl) => ({ value: `${pl.kind}:${pl.id}`, label: pl.name, kind: pl.kind as string })),
    { value: 'custom', label: w.t('rider.callSheet.newPlace'), kind: 'custom' },
  ], [places, w]);

  // A custom-ride end: 'production:<id>' / 'store:<id>' from the lists, or 'custom' for a one-off place.
  const buildCustomEnd = (which: End) => {
    const choice = which === 'pickup' ? pickupChoice : dropChoice;
    if (!choice) return { error: w.t(which === 'pickup' ? 'rider.callSheet.chooseStart' : 'rider.callSheet.chooseEnd') };
    if (choice === 'custom') {
      const name = customName[which].trim();
      const loc = customLoc[which];
      if (name.length < 2) return { error: w.t(which === 'pickup' ? 'rider.callSheet.nameStart' : 'rider.callSheet.nameEnd') };
      if (!loc) return { error: w.t('rider.callSheet.pinIt', { name }) };
      return { end: { kind: 'custom' as const, name, latitude: loc.latitude, longitude: loc.longitude } };
    }
    const [kind, id] = choice.split(':');
    return { end: { kind: kind as 'production' | 'store', id } };
  };

  const handleCall = async () => {
    if (!riderId) { toast.error(w.t('rider.callSheet.chooseRider')); return; }
    if (tripType !== 'custom' && !storeId) { toast.error(w.t('rider.callSheet.chooseStore')); return; }
    let pickup; let drop;
    if (tripType === 'custom') {
      const p = buildCustomEnd('pickup');
      const d = buildCustomEnd('drop');
      if ('error' in p || 'error' in d) { toast.error(('error' in p ? p.error : (d as { error: string }).error) as string); return; }
      pickup = p.end; drop = d.end;
    }
    const chosen = riders.find((r) => r.employeeId === riderId);
    let force = false;
    if (chosen && !chosen.available) {
      const ok = await confirm({
        title: w.t('rider.callSheet.unavailableTitle', { name: chosen.name }),
        body: w.t('rider.callSheet.unavailableBody', { reason: chosen.unavailableReason || '' }),
        confirmLabel: w.t('rider.callSheet.callAnyway'),
      });
      if (!ok) return;
      force = true;
    }
    setCalling(true);
    try {
      const fare = Number(fareInput);
      const trip = await rapi.callRider({ riderEmployeeId: riderId, storeId: tripType === 'custom' ? undefined : storeId, note, tripType, pickup, drop, fare: fare > 0 ? fare : undefined, force, requestIds: Array.from(linkedRequestIds) });
      onCalled(trip);
      setNote('');
      toast.success(w.t('rider.callSheet.notified', { name: trip.riderName }));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : w.t('rider.callSheet.failed'));
    } finally {
      setCalling(false);
    }
  };

  const startPinning = (which: End) => {
    setDraftName(customName[which]);
    setDraftLoc(customLoc[which]);
    setPinning(which);
  };
  const usePlace = () => {
    if (!pinning) return;
    const name = draftName.trim();
    if (name.length < 2) { toast.error(w.t(pinning === 'pickup' ? 'rider.callSheet.nameStart' : 'rider.callSheet.nameEnd')); return; }
    if (!draftLoc) { toast.error(w.t('rider.place.needPin')); return; }
    setCustomName((prev) => ({ ...prev, [pinning]: name }));
    setCustomLoc((prev) => ({ ...prev, [pinning]: draftLoc }));
    setPinning(null);
  };

  const chosen = riders.find((r) => r.employeeId === riderId);
  const fareHint = `${chosen?.defaultRate ? `${w.t('rider.callSheet.fareDefault', { name: chosen.name, amount: formatINR(wholeRupees(chosen.defaultRate)) })} ` : ''}${w.t(tripType === 'custom' ? 'rider.callSheet.fareHintCustom' : tripType === 'round_trip' ? 'rider.callSheet.fareHintRound' : 'rider.callSheet.fareHint')}`;
  const hint = places.find((pl) => pl.kind === 'production' && pl.latitude !== null);

  if (pinning) {
    return (
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={w.t('rider.place.title')}
        onBack={() => setPinning(null)}
        footer={<Button size="lg" fullWidth leadingIcon={<Check />} onClick={usePlace}>{w.t('rider.place.use')}</Button>}
      >
        <div className="flex flex-col gap-4">
          <Field label={w.t('rider.place.name')}>
            <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder={w.t('rider.place.namePlaceholder')} />
          </Field>
          <Suspense fallback={<MapPlaceholder height={280} />}>
            <LocationPicker
              value={draftLoc}
              onChange={setDraftLoc}
              centerHint={hint ? { latitude: hint.latitude as number, longitude: hint.longitude as number } : null}
              height={280}
            />
          </Suspense>
        </div>
      </ResponsiveModal>
    );
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={w.t('rider.callSheet.title')}
      footer={riders.length > 0 ? <Button size="lg" fullWidth loading={calling} onClick={handleCall}>{w.t('rider.callSheet.submit')}</Button> : undefined}
    >
      {riders.length === 0 ? (
        <EmptyState compact icon={MapPin} title={w.t('rider.staff.noRiders')} body={w.t('rider.staff.noRidersBody')} />
      ) : (
        <div className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-body-sm font-medium text-text">{w.t('rider.callSheet.type')}</legend>
            <div role="radiogroup" aria-label={w.t('rider.callSheet.type')} className="grid grid-cols-2 gap-2">
              {TRIP_TYPES.map((tt) => {
                const on = tripType === tt;
                const sub = tt === 'round_trip' ? w.t('rider.type.round_tripHint') : tt === 'custom' ? w.t('rider.type.customHint') : null;
                return (
                  <button
                    key={tt}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setTripType(tt)}
                    className={cn(
                      'flex min-h-14 flex-col justify-center rounded-md border px-3 py-2 text-left outline-none transition-colors duration-(--dur-fast) focus-visible:ring-2 focus-visible:ring-ring',
                      on ? 'border-primary bg-primary-soft text-text' : 'border-border-strong bg-surface text-text hover:bg-surface-2',
                    )}
                  >
                    <span className={cn('text-body-sm', on ? 'font-semibold' : 'font-medium')}>{w.t(`rider.type.${tt}` as I18nKey)}</span>
                    {sub && <span className="text-caption text-text-2">{sub}</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="flex flex-col">
            <legend className="mb-2 text-body-sm font-medium text-text">{w.t('rider.callSheet.rider')}</legend>
            <div role="radiogroup" aria-label={w.t('rider.callSheet.rider')} className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
              {riders.map((r) => {
                const on = riderId === r.employeeId;
                return (
                  <button
                    key={r.employeeId}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => selectRider(r)}
                    className={cn(
                      'flex min-h-15 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors duration-(--dur-fast) focus-visible:bg-surface-2',
                      on ? 'bg-primary-soft' : 'hover:bg-surface-2/60',
                    )}
                  >
                    <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px]', on ? 'border-primary' : 'border-border-strong')} aria-hidden="true">
                      {on && <span className="size-2.5 rounded-full bg-primary" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body-md font-medium text-text">{r.name}</span>
                      <span className="text-label text-text-3">
                        {r.available ? (r.defaultRate ? w.t('rider.staff.perRide', { amount: formatINR(wholeRupees(r.defaultRate)) }) : w.t('rider.staff.noRate')) : r.unavailableReason}
                      </span>
                    </span>
                    <StatusChip tone={r.available ? 'success' : 'danger'} dot>{r.available ? w.t('rider.staff.available') : w.t('rider.staff.unavailable')}</StatusChip>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {tripType === 'custom' ? (
            (['pickup', 'drop'] as const).map((which) => {
              const choice = which === 'pickup' ? pickupChoice : dropChoice;
              const setChoice = which === 'pickup' ? setPickupChoice : setDropChoice;
              const pinned = customLoc[which];
              return (
                <div key={which} className="flex flex-col gap-2">
                  <span className="text-body-sm font-medium text-text">{w.t(which === 'pickup' ? 'rider.callSheet.startsAt' : 'rider.callSheet.endsAt')}</span>
                  <ChoiceChips
                    aria-label={w.t(which === 'pickup' ? 'rider.callSheet.startsAt' : 'rider.callSheet.endsAt')}
                    value={choice}
                    onValueChange={(v) => { setChoice(v); if (v === 'custom' && !customLoc[which]) startPinning(which); }}
                    options={placeOptions.map((o) => ({
                      value: o.value,
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          {o.kind === 'production' ? <Factory className="size-4" aria-hidden="true" /> : o.kind === 'store' ? <Store className="size-4" aria-hidden="true" /> : <MapPin className="size-4" aria-hidden="true" />}
                          {o.label}
                        </span>
                      ),
                    }))}
                  />
                  {choice === 'custom' && (
                    <button
                      type="button"
                      onClick={() => startPinning(which)}
                      className="flex min-h-14 items-center gap-3 rounded-md border border-border-strong bg-surface px-3 text-left outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <MapPin className={cn('size-5 shrink-0', pinned ? 'text-success' : 'text-warning')} aria-hidden="true" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-body-md font-medium text-text">{customName[which] || w.t('rider.place.title')}</span>
                        <span className="text-label text-text-3">{pinned ? w.t('rider.callSheet.pinned') : w.t('rider.callSheet.pinPlace')}</span>
                      </span>
                      <Pencil className="size-4 shrink-0 text-text-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-body-sm font-medium text-text">{w.t(`rider.callSheet.store.${tripType}` as I18nKey)}</span>
              {stores.length === 0 ? (
                <p className="text-body-sm text-text-2">{w.t('rider.callSheet.noStores')}</p>
              ) : (
                <ChoiceChips aria-label={w.t(`rider.callSheet.store.${tripType}` as I18nKey)} value={storeId} onValueChange={setStoreId} options={stores.map((s) => ({ value: s.id, label: s.name }))} />
              )}
            </div>
          )}

          {openRequests.length > 0 && (
            <fieldset className="flex flex-col gap-1">
              <legend className="text-body-sm font-medium text-text">{w.t('rider.callSheet.requests')}</legend>
              <p className="mb-1.5 text-caption text-text-3">{w.t('rider.callSheet.requestsHelp')}</p>
              <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
                {openRequests.map((r) => {
                  const shipped = isShipped(r.status);
                  const id = `call-req-${r.id}`;
                  return (
                    <label key={r.id} htmlFor={id} className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2">
                      <Checkbox
                        id={id}
                        checked={linkedRequestIds.has(r.id)}
                        onCheckedChange={(checked) => setLinkedRequestIds((prev) => {
                          const next = new Set(prev);
                          if (checked === true) next.add(r.id); else next.delete(r.id);
                          return next;
                        })}
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-body-md font-medium text-text">{w.t('rider.callSheet.requestFor', { date: w.day(r.requestDate.slice(0, 10)) })}</span>
                        {!shipped && <span className="text-label text-text-3">{w.t('rider.callSheet.notShippedHelp')}</span>}
                      </span>
                      <StatusChip tone={shipped ? 'success' : 'warning'}>{shipped ? w.t('rider.callSheet.shipped') : w.t('rider.callSheet.notShipped', { status: r.status })}</StatusChip>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          <Field label={w.t('rider.callSheet.fare')} helper={fareHint}>
            <MoneyInput value={fareInput} decimals={0} onValueChange={(_n, raw) => setFareInput(raw)} placeholder={w.t('rider.callSheet.farePlaceholder')} />
          </Field>
          <Field label={w.t('rider.callSheet.note')} optional>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={w.t('rider.callSheet.notePlaceholder')} />
          </Field>
        </div>
      )}
    </ResponsiveModal>
  );
}
