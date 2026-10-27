// Rider: finished and cancelled rides for a chosen period, with the rides, earnings and
// cancellations it adds up to. Loads only while it is on screen (it used to wait for "Past rides"
// to be opened), and again whenever a ride finishes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { History } from 'lucide-react';
import type { RiderTrip } from '../../utils/api';
import { FilterChips } from '../ui/chip';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { ListGroup } from '../ui/list-row';
import { Money } from '../ui/money';
import { Skeleton, SkeletonListRows } from '../ui/skeleton';
import { StatSplit } from '../ui/stat-tile';
import type { I18nKey } from '../../utils/i18n';
import { useRiderApi } from './riderApi';
import { useRideWords } from './rideWords';
import { RideRow } from './RideRow';
import { PAST_PERIODS, istToday, pastRange, pastTotals, shiftIso, wholeRupees, type PastPeriod } from './tripUtils';

export function RiderHistory({ refreshKey, onOpenTrip }: { refreshKey: number; onOpenTrip: (trip: RiderTrip) => void }) {
  const rapi = useRiderApi();
  const w = useRideWords();
  const [period, setPeriod] = useState<PastPeriod>('today');
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => ({ from: shiftIso(istToday(), -7), to: istToday() }));
  const [rides, setRides] = useState<RiderTrip[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const range = useMemo(() => pastRange(period, custom), [period, custom]);
  // Keep the chosen period's chip in view in the sideways-scrolling row.
  const chipsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chipsRef.current?.querySelector('[aria-pressed=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [period]);

  useEffect(() => {
    if (!range) return;
    let cancelled = false;
    setLoading(true);
    rapi.getRiderTripsRange(range.from, range.to)
      .then((list) => { if (!cancelled) { setRides(list.filter((x) => x.status === 'delivered' || x.status === 'cancelled')); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : w.t('rider.past.loadFailed')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, refreshKey, attempt, rapi]);

  const totals = pastTotals(rides || []);

  return (
    <div className="flex flex-col gap-4">
      <div ref={chipsRef}>
        <FilterChips
          aria-label={w.t('rider.past.period')}
          value={period}
          onValueChange={setPeriod}
          options={PAST_PERIODS.map((p) => ({ value: p, label: w.t(`rider.past.${p}` as I18nKey) }))}
        />
      </div>
      {period === 'custom' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={w.t('rider.past.from')}>
            <Input type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
          </Field>
          <Field label={w.t('rider.past.to')}>
            <Input type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </Field>
        </div>
      )}

      {!range ? (
        <p className="text-body-sm text-text-2">{w.t('rider.past.pickDates')}</p>
      ) : error ? (
        <ErrorState body={error} onRetry={() => setAttempt((n) => n + 1)} retrying={loading} />
      ) : loading || !rides ? (
        <>
          <Skeleton className="h-[74px] w-full rounded-lg" />
          <SkeletonListRows count={4} />
        </>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-surface p-4">
            <StatSplit
              items={[
                { label: w.t('rider.past.rides'), value: totals.rides },
                { label: w.t('rider.past.earned'), value: <Money value={wholeRupees(totals.earned)} /> },
                { label: w.t('rider.past.cancelled'), value: totals.cancelled },
              ]}
            />
          </div>
          {rides.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface">
              <EmptyState compact icon={History} title={w.t('rider.past.empty')} />
            </div>
          ) : (
            <ListGroup>
              {rides.map((x) => (
                <RideRow
                  key={x.id}
                  trip={x}
                  subtitle={`${w.day(x.date)} · ${w.t('rider.ride', { n: x.tripNumber })} · ${w.time(x.status === 'delivered' ? x.deliveredAt : x.cancelledAt)}`}
                  amount={x.fare}
                  struck={x.status !== 'delivered'}
                  onClick={() => onOpenTrip(x)}
                />
              ))}
            </ListGroup>
          )}
        </>
      )}
    </div>
  );
}
