// Dispatch roles pin the production house and each store on the map once, by standing there and
// tapping "Use my location here". A row on the riders screen says how many are missing and opens
// the list in a sheet.
import { useState } from 'react';
import { Crosshair, Factory, MapPin, Store } from 'lucide-react';
import { toast } from '../ui/sonner';
import type { RiderPlace } from '../../utils/api';
import { Button } from '../ui/button';
import { confirm } from '../ui/confirm';
import { ListGroup, ListRow } from '../ui/list-row';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SkeletonListRows } from '../ui/skeleton';
import { StatusChip } from '../ui/status-chip';
import { useRiderApi } from './riderApi';
import { useRideWords } from './rideWords';

// The places come from the riders screen, which loads them once for this and for Call a rider.
export function MapPinsRow({ places, reload: load }: { places: RiderPlace[] | null; reload: () => void }) {
  const rapi = useRiderApi();
  const w = useRideWords();
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const pin = async (place: RiderPlace) => {
    const ok = await confirm({
      title: w.t('rider.pins.confirmTitle', { name: place.name }),
      body: w.t('rider.pins.confirmBody', { kind: place.kind === 'store' ? w.t('rider.pins.kindStore') : w.t('rider.pins.kindProduction') }),
      confirmLabel: w.t('rider.pins.confirm'),
    });
    if (!ok) return;
    setBusyKey(`${place.kind}:${place.id}`);
    try {
      const pos = await rapi.getCurrentPosition();
      await rapi.setRiderPlace({ kind: place.kind, id: place.id, latitude: pos.latitude, longitude: pos.longitude });
      toast.success(w.t('rider.pins.saved', { name: place.name }));
      load();
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : w.t('rider.pins.noGps'));
    } finally {
      setBusyKey(null);
    }
  };

  const missing = (places || []).filter((p) => p.latitude === null).length;
  return (
    <>
      <ListGroup>
        <ListRow
          icon={MapPin}
          title={w.t('rider.pins.title')}
          subtitle={w.t('rider.pins.short')}
          onClick={() => setOpen(true)}
          trailing={places === null ? undefined : missing > 0
            ? <StatusChip tone="warning">{w.t('rider.pins.notSet', { n: missing })}</StatusChip>
            : <StatusChip tone="success">{w.t('rider.pins.allSet')}</StatusChip>}
          chevron
        />
      </ListGroup>
      <ResponsiveModal open={open} onOpenChange={setOpen} title={w.t('rider.pins.title')} description={w.t('rider.pins.help')}>
        {places === null ? (
          <SkeletonListRows count={3} />
        ) : (
          <ListGroup>
            {places.map((p) => {
              const key = `${p.kind}:${p.id}`;
              return (
                <ListRow
                  key={key}
                  icon={p.kind === 'store' ? Store : Factory}
                  iconTone={p.latitude !== null ? 'neutral' : 'warning'}
                  title={p.name}
                  subtitle={p.latitude !== null ? (p.setByName ? w.t('rider.pins.pinnedBy', { name: p.setByName }) : w.t('rider.pins.pinned')) : w.t('rider.pins.notPinned')}
                  trailing={
                    <Button variant="secondary" size="sm" leadingIcon={<Crosshair />} loading={busyKey === key} onClick={() => pin(p)}>
                      {p.latitude !== null ? w.t('rider.pins.update') : w.t('rider.pins.use')}
                    </Button>
                  }
                />
              );
            })}
          </ListGroup>
        )}
      </ResponsiveModal>
    </>
  );
}
