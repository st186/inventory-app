// The day's expenses on the Expenses screen, as list groups by type (wireframe Expenses):
// ingredients (one card per category with its total - meat, dairy, vegetables, ... - as before the
// new look; owner, 29 Oct 2026), running costs, fixed costs. Tap a row to edit it (delete sits in that sheet).
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { InventoryItem, OverheadItem, FixedCostItem } from '../App';
import { BUILT_IN_ITEM_BENGALI, INVENTORY_CATEGORIES } from '../utils/inventoryData';
import * as api from '../utils/api';
import type { PriceFlag } from '../utils/expenseChecks';
import { useT } from '../utils/i18n';
import { ListGroup, ListRow, IconWell } from './ui/list-row';
import { StatusChip } from './ui/status-chip';
import { formatINR } from './ui/money';
import { categoryIcon, categoryText, paidByLabel, stripEmoji } from './money/categoryDisplay';

type Props = {
  inventory: InventoryItem[];
  overheads: OverheadItem[];
  fixedCosts: FixedCostItem[];
  onEditInventory: (item: InventoryItem) => void;
  onEditOverhead: (item: OverheadItem) => void;
  onEditFixedCost: (item: FixedCostItem) => void;
  isManager?: boolean;
  // Entries whose price looks like a unit slip (utils/expenseChecks.ts), by id.
  priceFlags?: Map<string, PriceFlag>;
  /** Rows deleted a moment ago (still undoable) - kept off the list. */
  hiddenIds?: ReadonlySet<string>;
};

// Show decimals only when needed.
const formatNumber = (num: number): string => {
  const rounded = Math.round(num * 100) / 100;
  return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2);
};

/** "Cash" / "Paytm" / "Split" / "Own money" / "Production cash" chip. */
export function PaidByChip({ item }: { item: { paymentMethod?: string; paidFromProductionHouseId?: string | null; cashAmount?: number; onlineAmount?: number } }) {
  const { t } = useT();
  const kind = paidByLabel(item);
  if (!kind) return null;
  const label = kind === 'cash' ? t('money.cash') : kind === 'paytm' ? t('money.paytm') : kind === 'split' ? t('money.split') : kind === 'owner' ? t('paid.owner') : t('paid.productionCash');
  return <StatusChip tone={kind === 'owner' || kind === 'productionCash' ? 'brand' : 'neutral'} size="sm">{label}</StatusChip>;
}

export function InventoryList({
  inventory,
  overheads,
  fixedCosts,
  onEditInventory,
  onEditOverhead,
  onEditFixedCost,
  isManager = true,
  priceFlags,
  hiddenIds,
}: Props) {
  const { t } = useT();
  const [customItems, setCustomItems] = useState<api.CustomItem[]>([]);

  useEffect(() => {
    api.getCustomItems().then(setCustomItems).catch(() => {});
  }, []);

  const getItemMeta = (itemName: string, category: string) =>
    customItems.find((ci) => ci.category === category && ci.itemName.trim().toLowerCase() === itemName.trim().toLowerCase());

  // Possible duplicates: same name, quantity, unit, rate and total on the same day.
  const duplicateIds = new Set<string>();
  for (let i = 0; i < inventory.length; i++) {
    for (let j = i + 1; j < inventory.length; j++) {
      const a = inventory[i], b = inventory[j];
      if (
        a.itemName.toLowerCase().trim() === b.itemName.toLowerCase().trim() &&
        a.quantity === b.quantity &&
        a.unit === b.unit &&
        a.costPerUnit === b.costPerUnit &&
        a.totalCost === b.totalCost
      ) {
        duplicateIds.add(a.id);
        duplicateIds.add(b.id);
      }
    }
  }

  const visible = <T extends { id: string }>(list: T[]) => (hiddenIds && hiddenIds.size ? list.filter((x) => !hiddenIds.has(x.id)) : list);
  // Ingredients by category, in the usual order (meat, dairy, vegetables, staples, ...); any other category after.
  const ingredients = visible(inventory);
  const order: string[] = Object.keys(INVENTORY_CATEGORIES);
  const rank = (c: string) => (order.includes(c) ? order.indexOf(c) : order.length);
  const byCategory = [...ingredients.reduce((m, item) => m.set(item.category, [...(m.get(item.category) || []), item]), new Map<string, InventoryItem[]>())]
    .sort(([a], [b]) => rank(a) - rank(b) || categoryText(a).localeCompare(categoryText(b)));
  const running = visible(overheads);
  const fixed = visible(fixedCosts);

  return (
    <div className="flex flex-col gap-6">
      {ingredients.length > 0 && (
        <section className="flex flex-col gap-3" aria-label={t('exp.ingredients')}>
          <div className="flex min-h-6 items-baseline gap-2">
            <h2 className="text-subtitle font-semibold text-text">{t('exp.ingredients')}</h2>
            <span className="text-label text-text-3">{formatINR(ingredients.reduce((s, i) => s + i.totalCost, 0))}</span>
          </div>
          {byCategory.map(([category, items]) => (
            <ListGroup key={category} overline={`${categoryText(category)} · ${formatINR(items.reduce((s, i) => s + i.totalCost, 0))}`}>
              {items.map((item) => {
                const meta = getItemMeta(item.itemName, item.category);
                const bengali = meta?.itemNameBengali || BUILT_IN_ITEM_BENGALI[item.itemName];
                const flag = priceFlags?.get(item.id);
                const isDuplicate = duplicateIds.has(item.id);
                return (
                  <ListRow
                    key={item.id}
                    leading={<IconWell icon={categoryIcon(item.category, 'inventory')} />}
                    title={<span>{item.itemName}{bengali ? <span className="font-normal text-text-3"> · {bengali}</span> : null}</span>}
                    subtitle={
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="num">{formatNumber(item.quantity || 0)} {item.unit} · {formatINR(item.costPerUnit || 0)}/{item.unit}</span>
                        {item.paymentMethod === 'both' && <span className="num">{t('money.cash')} {formatINR(item.cashAmount || 0)} + {t('money.paytm')} {formatINR(item.onlineAmount || 0)}</span>}
                        {isDuplicate && <StatusChip tone="warning" size="sm" icon={AlertTriangle}>{t('exp.duplicate')}</StatusChip>}
                        {flag && <StatusChip tone="warning" size="sm" icon={AlertTriangle} title={flag.message}>{t('exp.checkUnit')}</StatusChip>}
                      </span>
                    }
                    chip={<PaidByChip item={item} />}
                    amount={item.totalCost}
                    onClick={isManager ? () => onEditInventory(item) : undefined}
                  />
                );
              })}
            </ListGroup>
          ))}
        </section>
      )}

      {running.length > 0 && (
        <ListGroup title={t('exp.running')} meta={formatINR(running.reduce((s, i) => s + i.amount, 0))}>
          {running.map((item) => (
            <ListRow
              key={item.id}
              leading={<IconWell icon={categoryIcon(item.category, 'overhead')} />}
              title={stripEmoji(item.description) || categoryText(item.category)}
              subtitle={
                <span className="flex flex-col">
                  <span>{categoryText(item.category)}</span>
                  {item.category === 'personal_expense' && item.employeeId && item.employeeName && <span>{item.employeeName} · {item.employeeId}</span>}
                  {item.category === 'personal_expense' && item.expenseMonth && (
                    <span>For {new Date(item.expenseMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                  )}
                  {item.paymentMethod === 'both' && <span className="num">{t('money.cash')} {formatINR(item.cashAmount || 0)} + {t('money.paytm')} {formatINR(item.onlineAmount || 0)}</span>}
                </span>
              }
              chip={<PaidByChip item={item} />}
              amount={item.amount}
              onClick={isManager ? () => onEditOverhead(item) : undefined}
            />
          ))}
        </ListGroup>
      )}

      {fixed.length > 0 && (
        <ListGroup title={t('exp.fixedCosts')} meta={formatINR(fixed.reduce((s, i) => s + i.amount, 0))}>
          {fixed.map((item) => (
            <ListRow
              key={item.id}
              leading={<IconWell icon={categoryIcon(item.category, 'fixedcost')} />}
              title={categoryText(item.category)}
              subtitle={
                <span className="flex flex-col">
                  {item.description && <span>{stripEmoji(item.description)}</span>}
                  {item.category === 'lpg_gas' && item.units && item.unitPrice && (
                    <span className="num">{item.units} cylinder{item.units > 1 ? 's' : ''} × {formatINR(item.unitPrice)}</span>
                  )}
                  {item.paymentMethod === 'both' && <span className="num">{t('money.cash')} {formatINR(item.cashAmount || 0)} + {t('money.paytm')} {formatINR(item.onlineAmount || 0)}</span>}
                </span>
              }
              chip={<PaidByChip item={item} />}
              amount={item.amount}
              onClick={isManager ? () => onEditFixedCost(item) : undefined}
            />
          ))}
        </ListGroup>
      )}
    </div>
  );
}
