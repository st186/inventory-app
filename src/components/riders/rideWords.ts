// The words the rider screens put on a ride, in the person's App language (riders default to
// Bengali): place names, route, ride type, status, steps, times.
import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Bike, BellRing, Check, CheckCircle2, MapPin, PackageCheck, XCircle } from 'lucide-react';
import type { RiderStop, RiderTrip, RiderTripStatus } from '../../utils/api';
import { useT, type I18nKey } from '../../utils/i18n';
import type { StatusTone } from '../ui/status-chip';
import { ageSeconds, dropStop, fmtTime, lastStop, pickupStop, stopsOf, tripTypeOf, type NextStepReason } from './tripUtils';

export type RideChip = { tone: StatusTone; icon: LucideIcon; label: string };

const STATUS_LOOK: Record<RiderTripStatus, { tone: StatusTone; icon: LucideIcon }> = {
  called: { tone: 'warning', icon: BellRing },
  on_the_way: { tone: 'info', icon: Bike },
  arrived: { tone: 'info', icon: MapPin },
  picked_up: { tone: 'info', icon: PackageCheck },
  delivered: { tone: 'success', icon: Check },
  cancelled: { tone: 'neutral', icon: XCircle },
};

export function useRideWords() {
  const { t, lang } = useT();
  return useMemo(() => {
    const name = (s: RiderStop) => s.name || t('rider.place.production');
    // "production house" / "the store" / a custom place's own name, inside a sentence.
    const stopWord = (s: RiderStop) => (s.kind === 'production' ? t('rider.place.productionLower') : s.kind === 'store' ? t('rider.place.storeLower') : s.name);
    const status = (trip: RiderTrip): string => {
      switch (trip.status) {
        case 'called': return t('rider.status.called');
        case 'on_the_way': return t('rider.status.toPlace', { place: stopWord(pickupStop(trip)) });
        case 'arrived': return t('rider.status.atPlace', { place: stopWord(pickupStop(trip)) });
        case 'picked_up': return t('rider.status.toPlace', { place: stopWord(dropStop(trip)) });
        case 'delivered': return t('rider.status.delivered');
        default: return t('rider.status.cancelled');
      }
    };
    // List rows use the short word (the route is already on the row); the ride's sheet the full one.
    const shortStatus = (trip: RiderTrip): string => {
      switch (trip.status) {
        case 'on_the_way': return t('rider.tl.onTheWay');
        case 'arrived': return t('rider.tl.arrived');
        case 'picked_up': return t('rider.tl.pickedUp');
        default: return status(trip);
      }
    };
    const chip = (trip: RiderTrip, short = false): RideChip => ({ ...STATUS_LOOK[trip.status], label: short ? shortStatus(trip) : status(trip) });
    // Staff lists: a delivered ride still waiting for the receiving end shows that instead.
    const staffChip = (trip: RiderTrip, canDispatch: boolean, short = false): RideChip => {
      if (trip.status === 'delivered') {
        if (trip.receipt?.status === 'confirmed') return { tone: 'success', icon: CheckCircle2, label: t('rider.status.received') };
        if (trip.receipt?.status === 'issue') return { tone: 'danger', icon: AlertTriangle, label: t('rider.status.problem') };
        if (canDispatch || lastStop(trip).kind === 'store') return { tone: 'warning', icon: PackageCheck, label: t('rider.status.toConfirm') };
      }
      return chip(trip, short);
    };
    const stepLabel = (s: RiderTripStatus) => t(`rider.step.${s}` as I18nKey);
    const stepWord = (s: RiderTripStatus) => t(`rider.stepWord.${s}` as I18nKey);
    const reason = (r: NextStepReason) => t(`rider.reason.${r}` as I18nKey);
    const age = (iso: string | null | undefined) => {
      if (!iso) return '';
      const secs = ageSeconds(iso);
      if (secs < 60) return t('rider.age.secs', { n: secs });
      const mins = Math.round(secs / 60);
      return mins < 60 ? t('rider.age.mins', { n: mins }) : t('rider.age.hours', { n: Math.round(mins / 60) });
    };
    const day = (isoDate: string) => {
      const d = new Date(`${isoDate}T00:00:00Z`);
      return `${t(`date.wd.${d.getUTCDay()}` as I18nKey)} ${d.getUTCDate()} ${t(`date.ms.${d.getUTCMonth()}` as I18nKey)}`;
    };
    const plural = (n: number, one: I18nKey, many: I18nKey) => t(n === 1 ? one : many, { n });
    return {
      t,
      lang,
      name,
      stopWord,
      route: (trip: RiderTrip) => stopsOf(trip).map(name).join(' → '),
      pickup: (trip: RiderTrip) => name(pickupStop(trip)),
      drop: (trip: RiderTrip) => name(dropStop(trip)),
      tripType: (trip: RiderTrip) => t(`rider.type.${tripTypeOf(trip)}` as I18nKey),
      status,
      chip,
      staffChip,
      stepLabel,
      stepWord,
      reason,
      age,
      time: (iso: string | null | undefined) => fmtTime(iso) || '',
      day,
      plural,
      rides: (n: number) => plural(n, 'rider.earn.ride1', 'rider.earn.rides'),
    };
  }, [t, lang]);
}

export type RideWords = ReturnType<typeof useRideWords>;
