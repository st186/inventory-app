// Map pins and the check-in distance (owner, Setup > Stores and production houses). The shift clock
// counts someone as "at the workplace" within this many metres of their place's pin, and the rider
// map uses the same pins. Same calls as before: the pins were under Riders > Map pins
// (api.getRiderPlaces / setRiderPlace) and the distance in Team > KPIs (kpiApi config).
import { useCallback, useEffect, useState } from 'react';
import { Factory, MapPin, Ruler, Store } from 'lucide-react';
import { toast } from 'sonner';
import { Geolocation } from '@capacitor/geolocation';
import * as api from '../../utils/api';
import { getTeamKpis, saveKpiConfig } from '../kpi/kpiApi';
import { getTodayIST } from '../../utils/timezone';
import { Button } from '../ui/button';
import { ListGroup, ListRow } from '../ui/list-row';
import { StatusChip } from '../ui/status-chip';
import { NumberStepper } from '../ui/number-stepper';
import { ErrorState } from '../ui/error-state';
import { ResponsiveModal } from '../ui/responsive-modal';
import { Skeleton, Delayed, SkeletonListRows } from '../ui/skeleton';
import { confirm } from '../ui/confirm';

export function PlacePins() {
  const [places, setPlaces] = useState<api.RiderPlace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [radius, setRadius] = useState<number | null>(null);
  const [radiusDraft, setRadiusDraft] = useState(150);
  const [radiusError, setRadiusError] = useState<string | null>(null);
  const [savingRadius, setSavingRadius] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.getRiderPlaces().then(setPlaces).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the pins'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const pin = async (place: api.RiderPlace) => {
    const where = place.kind === 'store' ? 'store' : 'production house';
    const ok = await confirm({
      title: `Pin ${place.name} here?`,
      body: `Saves where this phone is now as the location of ${place.name}. Do this while you are standing at the ${where}.`,
      confirmLabel: 'Use my location',
      tone: 'primary',
    });
    if (!ok) return;
    setBusyKey(`${place.kind}:${place.id}`);
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 });
      await api.setRiderPlace({ kind: place.kind, id: place.id, latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      toast.success(`${place.name} pinned`);
      load();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Could not get your location - check location permission');
    } finally {
      setBusyKey(null);
    }
  };

  // The distance lives in the KPI settings; read it when the sheet opens.
  const openRadius = async () => {
    setRadiusOpen(true);
    if (radius !== null) {
      setRadiusDraft(radius);
      return;
    }
    setRadiusError(null);
    try {
      const data = await getTeamKpis(getTodayIST().slice(0, 7));
      setRadius(data.config.radiusM);
      setRadiusDraft(data.config.radiusM);
    } catch (e) {
      setRadiusError(e instanceof Error ? e.message : 'Could not load the distance');
    }
  };

  const saveRadius = async () => {
    setSavingRadius(true);
    try {
      const r = await saveKpiConfig({ radiusM: radiusDraft });
      const next = (r as { config?: { radiusM: number } })?.config?.radiusM ?? radiusDraft;
      setRadius(next);
      toast.success(`Check-in distance set to ${next} m`);
      setRadiusOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSavingRadius(false);
    }
  };

  const missing = places ? places.filter((p) => p.latitude === null).length : 0;

  if (error && !places) return <ErrorState title="Couldn't load the map pins" body={error} onRetry={load} />;
  if (!places) return <Delayed><SkeletonListRows count={3} /></Delayed>;

  return (
    <>
      <ListGroup
        title="Map pins and check-in"
        meta={places.length ? (missing > 0 ? `${missing} not pinned` : 'All pinned') : undefined}
        footer="Pin each place once, on a phone, while standing there. Shift check-in and the rider map use these pins."
      >
        {places.map((p) => {
          const key = `${p.kind}:${p.id}`;
          const pinned = p.latitude !== null;
          return (
            <ListRow
              key={key}
              icon={p.kind === 'store' ? Store : Factory}
              title={p.name}
              subtitle={pinned ? `Pinned${p.setByName ? ` by ${p.setByName}` : ''}` : 'Not pinned yet'}
              trailing={
                busyKey === key
                  ? <StatusChip tone="info" icon={MapPin}>Locating</StatusChip>
                  : pinned ? <StatusChip tone="success" icon={MapPin}>Pinned</StatusChip> : <StatusChip tone="warning">Not pinned</StatusChip>
              }
              disabled={!!busyKey}
              onClick={() => pin(p)}
            />
          );
        })}
        <ListRow
          icon={Ruler}
          title="Check-in distance"
          subtitle={radius !== null ? `At the workplace within ${radius} m of the pin` : 'How close counts as at the workplace'}
          onClick={openRadius}
        />
      </ListGroup>

      <ResponsiveModal
        open={radiusOpen}
        onOpenChange={setRadiusOpen}
        title="Check-in distance"
        description="Someone counts as at the workplace within this distance of the pin."
        dirty={radius !== null && radiusDraft !== radius && !savingRadius}
        footer={<Button size="lg" className="flex-1" loading={savingRadius} disabled={radius === null || radiusDraft === radius} onClick={saveRadius}>Save distance</Button>}
      >
        {radiusError ? (
          <ErrorState body={radiusError} onRetry={() => { setRadius(null); openRadius(); }} />
        ) : radius === null ? (
          <Skeleton className="h-12 w-48" />
        ) : (
          <div className="flex flex-col items-start gap-2">
            <NumberStepper label="Metres" value={radiusDraft} onChange={setRadiusDraft} min={50} max={1000} step={10} editable unit="m" />
            <p className="text-caption text-text-3">Between 50 and 1000 m.</p>
          </div>
        )}
      </ResponsiveModal>
    </>
  );
}
