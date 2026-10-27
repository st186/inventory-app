// Rider "Trips": History · Payments as one row of tabs. Used as its own page (variant "trips")
// and inside the sheet Home opens while the shell has no Trips tab for riders.
import { useState } from 'react';
import type { RiderTrip } from '../../utils/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { cn } from '../ui/utils';
import { RiderHistory } from './RiderHistory';
import { RiderPayments } from './RiderEarnings';
import { useRideWords } from './rideWords';

export type TripsTab = 'history' | 'payments';

export function RiderTripsPanel({ refreshKey, deliveredCount, onOpenTrip, initialTab = 'history', inSheet = false }: {
  refreshKey: number;
  deliveredCount: number;
  onOpenTrip: (trip: RiderTrip) => void;
  initialTab?: TripsTab;
  inSheet?: boolean;
}) {
  const w = useRideWords();
  const [tab, setTab] = useState<TripsTab>(initialTab);
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TripsTab)}>
      <TabsList aria-label={w.t('rider.trips.title')} className={cn(inSheet && '-mx-4 w-auto bg-bg md:-mx-6')}>
        <TabsTrigger value="history">{w.t('rider.trips.history')}</TabsTrigger>
        <TabsTrigger value="payments">{w.t('rider.trips.payments')}</TabsTrigger>
      </TabsList>
      <TabsContent value="history" className={cn('pt-4', !inSheet && 'px-4 sm:px-6 lg:px-8')}>
        <RiderHistory refreshKey={refreshKey} onOpenTrip={onOpenTrip} />
      </TabsContent>
      <TabsContent value="payments" className={cn('pt-4', !inSheet && 'px-4 sm:px-6 lg:px-8')}>
        <RiderPayments deliveredCount={deliveredCount} />
      </TabsContent>
    </Tabs>
  );
}
