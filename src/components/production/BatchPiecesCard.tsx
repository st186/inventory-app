import { useState } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { MomoType } from '../../constants/momoTypes';
import { ProductionBatch, batchCode, leftoverCode, nextBatchNumber } from '../../utils/batches';
import { Button } from '../ui/button';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { useT } from '../../utils/i18n';

type Props = {
  momoType: MomoType;
  date: string;
  batches: ProductionBatch[];
  // Batches of this type from the last few days, for "folded from leftover stuffing".
  earlierBatchCodes: string[];
  disabled?: boolean;
  onChange: (batches: ProductionBatch[]) => void;
};

// Final pieces for one momo type, entered per stuffing batch (one mix = one batch). The code
// follows a fixed rule (DDMM-TYPE-B#) so the team can write it on tray cards and bag labels
// during the day without the app; this is where the evening entry records each batch's
// pieces. The type's total is the sum of its batches. Shown when a Batches row is opened.
export function BatchPiecesCard({ momoType, date, batches, earlierBatchCodes, disabled, onChange }: Props) {
  const { t } = useT();
  const [pickingLeftover, setPickingLeftover] = useState(false);
  const [leftoverPick, setLeftoverPick] = useState('');
  const key = momoType.inventoryKey;

  const update = (index: number, patch: Partial<ProductionBatch>) => {
    onChange(batches.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const addBatch = () => {
    onChange([...batches, { code: batchCode(date, key, nextBatchNumber(batches, date, key)), pieces: 0 }]);
  };

  const addLeftover = () => {
    const original = leftoverPick.trim().toUpperCase();
    if (!original) return;
    onChange([...batches, { code: leftoverCode(original), pieces: 0, leftoverOf: original }]);
    setLeftoverPick('');
    setPickingLeftover(false);
  };

  return (
    <div className="flex flex-col gap-2">
      {batches.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="num flex h-11 min-w-0 flex-1 items-center rounded-md border border-border bg-surface px-3 font-mono text-label text-text"
            title={b.leftoverOf ? `${b.leftoverOf} (leftover stuffing)` : undefined}
          >
            {b.code || t('stock.prod.noCode')}
          </span>
          <Input
            type="text"
            inputMode="numeric"
            value={b.pieces ? String(b.pieces) : ''}
            placeholder={t('stock.pcsUnit')}
            onChange={(e) => update(i, { pieces: Math.max(0, parseInt(e.target.value.replace(/[^\d]/g, ''), 10) || 0) })}
            disabled={disabled}
            aria-label={t('stock.prod.piecesIn', { code: b.code || t('stock.prod.noCode') })}
            className="num w-24 text-right"
          />
          {!disabled && <IconButton label={t('stock.prod.removeBatch', { code: b.code || t('stock.prod.noCode') })} icon={<Trash2 />} variant="danger-ghost" onClick={() => onChange(batches.filter((_, j) => j !== i))} />}
        </div>
      ))}

      {!disabled && (
        pickingLeftover ? (
          <div className="flex items-center gap-2">
            <Input
              list={`leftover-${key}-${date}`}
              value={leftoverPick}
              onChange={(e) => setLeftoverPick(e.target.value)}
              placeholder={t('stock.prod.leftoverFrom')}
              aria-label={t('stock.prod.leftoverFrom')}
              className="flex-1 font-mono"
            />
            <datalist id={`leftover-${key}-${date}`}>
              {earlierBatchCodes.map((c) => <option key={c} value={c} />)}
            </datalist>
            <Button variant="secondary" onClick={addLeftover}>{t('common.add')}</Button>
            <Button variant="ghost" onClick={() => setPickingLeftover(false)}>{t('common.cancel')}</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" leadingIcon={<Plus />} onClick={addBatch}>
              {t('stock.prod.addBatch', { n: batchCode(date, key, nextBatchNumber(batches, date, key)).split('-').pop() || '' })}
            </Button>
            <Button variant="ghost" size="sm" leadingIcon={<RotateCcw />} onClick={() => { setPickingLeftover(true); setLeftoverPick(earlierBatchCodes[0] || ''); }}>
              {t('stock.prod.fromLeftover')}
            </Button>
          </div>
        )
      )}
    </div>
  );
}
