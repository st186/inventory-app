import { Trash2 } from 'lucide-react';
import { getMomoType } from '../../constants/momoTypes';
import type { ProductionLedgerItem } from '../../utils/api';
import { IconButton } from '../ui/icon-button';
import { ListGroup, ListRow } from '../ui/list-row';
import { EmptyState } from '../ui/empty-state';
import { useT } from '../../utils/i18n';
import { ALL_ITEMS } from './kitchenDayMath';
import { useItemLabel } from './KitchenDay';

type Props = {
  items: ProductionLedgerItem[];
  disabled?: boolean;
  onDelete: (id: string) => void | Promise<void>;
};

const item = (id: string) => ALL_ITEMS.find((i) => i.id === id)!;
// loggedAt holds India time already (getNowIST), so it's read as UTC.
const clock = (iso?: string) => {
  if (!iso) return '';
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
};

// Today's batches with the time each was logged, removable until the day is closed (a closed day's
// figures and tomorrow's morning count depend on this list).
export function PreparedLineItemsList({ items, disabled, onDelete }: Props) {
  const { t } = useT();
  const label = useItemLabel();
  return (
    <ListGroup
      overline={t('stock.prod.todaysBatches')}
      meta={items.length ? String(items.length) : undefined}
      empty={<EmptyState compact title={t('stock.prod.noBatches')} />}
    >
      {items.map((it) => {
        const kg = (n: number) => t('stock.prod.kg', { n });
        // What went in: the shared dough / batter, cheese corn's own dough, a stuffing or coating.
        // A type's "own" dough from 30 Oct is the shared dough (server aggregatePreparedByPool).
        const parts: string[] = [];
        if (it.momoKey === 'GLOBAL_DOUGH') parts.push(`${label(item('dough'))} ${kg(it.globalPoolQty)}`);
        else if (it.momoKey === 'GLOBAL_BATTER') parts.push(`${label(item('batter'))} ${kg(it.globalPoolQty)}`);
        else {
          const m = getMomoType(it.momoKey);
          if (m && it.perTypePoolQty > 0) parts.push(`${label(item(`${m.perTypePoolField}:${m.inventoryKey}`))} ${kg(it.perTypePoolQty)}`);
          if (m && it.globalPoolQty > 0) {
            const own = m.inventoryKey === 'cheeseCorn' ? 'dough:cheeseCorn' : m.globalPoolField;
            parts.push(`${label(item(own))} ${kg(it.globalPoolQty)}`);
          }
          if (!m) parts.push(it.momoKey);
        }
        const sub = [clock(it.loggedAt), it.loggedByName ? t('stock.prod.byName', { name: it.loggedByName }) : ''].filter(Boolean).join(' · ');
        return (
          <ListRow
            key={it.id}
            density="compact"
            title={parts.join(' · ')}
            subtitle={sub || undefined}
            trailing={!disabled ? <IconButton label={t('stock.prod.remove')} icon={<Trash2 />} variant="danger-ghost" onClick={() => onDelete(it.id)} /> : undefined}
          />
        );
      })}
    </ListGroup>
  );
}
