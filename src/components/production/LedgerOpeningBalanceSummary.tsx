import { GLOBAL_POOLS, MOMO_TYPES, getPerTypePoolId } from '../../constants/momoTypes';
import type { ProductionLedgerPoolState } from '../../utils/api';
import { useT } from '../../utils/i18n';
import { momoName } from '../stock/stockShared';

type Props = {
  pools: Record<string, ProductionLedgerPoolState>;
};

// Read-only summary of today's opening balance per pool - always the prior day's
// directly-reported closing count (or that day's own opening+prepared if it was never
// closed), never a formula anyone can second-guess.
export function LedgerOpeningBalanceSummary({ pools }: Props) {
  const { t, lang } = useT();
  const pool = (id: string) => pools[id] || { opening: 0, prepared: 0, closingActual: null, wastage: null };
  const cells = [
    ...GLOBAL_POOLS.map((id) => ({ id, label: id === 'dough' ? t('stock.prod.dough').replace(/ \(.*\)$/, '') : t('stock.prod.batter').replace(/ \(.*\)$/, '') })),
    ...MOMO_TYPES.map((m) => ({ id: getPerTypePoolId(m), label: `${momoName(lang, m.inventoryKey, m.label)} · ${m.perTypePoolField === 'stuffing' ? t('stock.prod.stuffingKg') : t('stock.prod.coatingKg')}`.replace(/ \(.*\)$/, '') })),
  ];
  return (
    <section className="flex flex-col gap-2">
      <div className="mx-1 flex flex-col">
        <h3 className="text-body-md font-semibold text-text">{t('stock.prod.opening')}</h3>
        <span className="text-label text-text-3">{t('stock.prod.openingHint')}</span>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cells.map((c) => (
          <div key={c.id} className="flex flex-col rounded-md border border-border bg-surface px-3 py-2">
            <dt className="text-caption text-text-3">{c.label}</dt>
            <dd className="num text-body-md font-semibold text-text">{t('stock.prod.kg', { n: pool(c.id).opening.toFixed(2) })}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
