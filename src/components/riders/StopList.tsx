// Where a ride goes: each stop with its icon, a "From" / "To" word and, when the app knows the
// place's incharge and their phone number, a 44 px call button.
import { Factory, MapPin, Phone, Store } from 'lucide-react';
import type { RiderStop } from '../../utils/api';
import { IconButton } from '../ui/icon-button';
import { IconWell } from '../ui/list-row';
import { cn } from '../ui/utils';
import { useRideWords } from './rideWords';
import type { Contact } from './tripUtils';

export type StopItem = { stop: RiderStop; label: string; contact?: Contact | null; muted?: boolean };

export function StopList({ items, className }: { items: StopItem[]; className?: string }) {
  const w = useRideWords();
  return (
    <ol className={cn('flex flex-col', className)}>
      {items.map((item, i) => {
        const Icon = item.stop.kind === 'production' ? Factory : item.stop.kind === 'store' ? Store : MapPin;
        return (
          <li key={`${item.stop.kind}:${item.stop.id ?? item.stop.name}:${i}`} className="relative flex min-h-14 items-center gap-3">
            {i < items.length - 1 && <span aria-hidden="true" className="absolute top-11 left-[19px] h-[calc(100%-36px)] w-0.5 bg-border" />}
            <IconWell icon={Icon} size={40} tone={item.muted ? 'neutral' : i === 0 ? 'primary' : 'neutral'} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-label text-text-3">{item.label}</span>
              <span className={cn('text-subtitle font-semibold', item.muted ? 'text-text-2' : 'text-text')}>{w.name(item.stop)}</span>
            </span>
            {item.contact && (
              <IconButton
                variant="secondary"
                icon={<Phone />}
                label={w.t('rider.call', { name: item.contact.name })}
                href={`tel:${item.contact.phone}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
