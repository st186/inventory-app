import { Trash2 } from 'lucide-react';
import { getMomoType } from '../../constants/momoTypes';
import type { ProductionLedgerItem } from '../../utils/api';
import { IconButton } from '../ui/icon-button';
import { ListGroup, ListRow } from '../ui/list-row';
import { EmptyState } from '../ui/empty-state';
import { useT } from '../../utils/i18n';
import { momoName } from '../stock/stockShared';

type Props = {
  items: ProductionLedgerItem[];
  disabled?: boolean;
  onDelete: (id: string) => void | Promise<void>;
};

// Today's logged batches, removable until the day is closed (a closed day's wastage and
// tomorrow's opening depend on this list).
export function PreparedLineItemsList({ items, disabled, onDelete }: Props) {
  const { t, lang } = useT();
  return (
    <ListGroup
      overline={t('stock.prod.todaysBatches')}
      meta={items.length ? String(items.length) : undefined}
      empty={<EmptyState compact title={t('stock.prod.noBatches')} />}
    >
      {items.map((item) => {
        const by = item.loggedByName ? ` · ${t('stock.prod.byName', { name: item.loggedByName })}` : '';
        const remove = !disabled ? <IconButton label={t('stock.prod.remove')} icon={<Trash2 />} variant="danger-ghost" onClick={() => onDelete(item.id)} /> : undefined;
        // GLOBAL_DOUGH/GLOBAL_BATTER are logs of the shared pool itself, with no momo type.
        if (item.momoKey === 'GLOBAL_DOUGH' || item.momoKey === 'GLOBAL_BATTER') {
          const pool = (item.momoKey === 'GLOBAL_DOUGH' ? t('stock.prod.dough') : t('stock.prod.batter')).replace(/ \(.*\)$/, '');
          return <ListRow key={item.id} density="compact" title={t('stock.prod.sharedPoolLine', { pool })} subtitle={`${t('stock.prod.kg', { n: item.globalPoolQty })}${by}`} trailing={remove} />;
        }
        const momoType = getMomoType(item.momoKey);
        const globalWord = (momoType?.globalPoolField === 'batter' ? t('stock.prod.batter') : t('stock.prod.dough')).replace(/ \(.*\)$/, '');
        const perTypeWord = (momoType?.perTypePoolField === 'coating' ? t('stock.prod.coatingKg') : t('stock.prod.stuffingKg')).replace(/ \(.*\)$/, '');
        return (
          <ListRow
            key={item.id}
            density="compact"
            title={momoType ? momoName(lang, momoType.inventoryKey, momoType.label) : item.momoKey}
            subtitle={`${perTypeWord} ${t('stock.prod.kg', { n: item.perTypePoolQty })}${item.globalPoolQty > 0 ? ` · ${globalWord} ${t('stock.prod.kg', { n: item.globalPoolQty })}` : ''}${by}`}
            trailing={remove}
          />
        );
      })}
    </ListGroup>
  );
}
