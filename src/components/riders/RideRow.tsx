// One ride as a list row: the route, a line of detail, the fare and the ride's status chip.
import type { ReactNode } from 'react';
import { Bike } from 'lucide-react';
import type { RiderTrip } from '../../utils/api';
import { ListRow } from '../ui/list-row';
import { Money } from '../ui/money';
import { StatusChip } from '../ui/status-chip';
import { cn } from '../ui/utils';
import { useRideWords, type RideChip } from './rideWords';
import { wholeRupees } from './tripUtils';

export function RideRow({ trip, title, subtitle, amount, struck, chip, onClick }: {
  trip: RiderTrip;
  title?: ReactNode;
  subtitle?: ReactNode;
  amount?: number | null;
  /** Cancelled rides: the fare is shown struck through (it isn't earned). */
  struck?: boolean;
  chip?: RideChip;
  onClick?: () => void;
}) {
  const w = useRideWords();
  const look = chip ?? w.chip(trip, true);
  return (
    <ListRow
      icon={Bike}
      title={title ?? w.route(trip)}
      subtitle={subtitle}
      onClick={onClick}
      trailing={
        <span className="flex shrink-0 flex-col items-end gap-1">
          {amount !== undefined && amount !== null && (
            <Money value={wholeRupees(amount)} className={cn('text-body-md font-semibold', struck ? 'text-text-3 line-through' : 'text-text')} />
          )}
          <StatusChip tone={look.tone} icon={look.icon} size="sm" className="max-w-[9.5rem] overflow-hidden text-ellipsis">
            <span className="truncate">{look.label}</span>
          </StatusChip>
        </span>
      }
      chevron={false}
    />
  );
}
