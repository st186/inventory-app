import { useState } from 'react';
import { Plus, Trash2, RotateCcw } from 'lucide-react';
import type { MomoType } from '../../constants/momoTypes';
import { ProductionBatch, batchCode, bagsLabel, leftoverCode, nextBatchNumber } from '../../utils/batches';

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
// pieces. The type's total is the sum of its batches.
export function BatchPiecesCard({ momoType, date, batches, earlierBatchCodes, disabled, onChange }: Props) {
  const [pickingLeftover, setPickingLeftover] = useState(false);
  const [leftoverPick, setLeftoverPick] = useState('');
  const total = batches.reduce((sum, b) => sum + (b.pieces || 0), 0);
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
    <div className="rounded-xl p-4 border-2" style={{ backgroundColor: `${momoType.color}0d`, borderColor: `${momoType.color}40` }}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: momoType.color }} />
          <h3 className="text-sm font-semibold text-gray-900 leading-tight">
            {momoType.label} {momoType.group === 'kurkure' ? 'Kurkure' : ''} Momos
          </h3>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-base font-bold text-gray-900 tabular-nums">{total} pcs</p>
          <p className="text-[11px] text-gray-500">{bagsLabel(total, key)}</p>
        </div>
      </div>

      {batches.length > 0 && (
        <div className="space-y-2 mb-3">
          {batches.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              {b.code ? (
                <span className="font-mono text-[11px] font-semibold px-2 py-1.5 rounded-md bg-white border border-gray-300 text-gray-800 flex-shrink-0" title={b.leftoverOf ? `Folded from leftover stuffing of ${b.leftoverOf}` : 'Batch code'}>
                  {b.code}
                </span>
              ) : (
                <span className="text-[11px] font-medium px-2 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 flex-shrink-0" title="Entered before batch codes were used">
                  No code
                </span>
              )}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={b.pieces || ''}
                placeholder="pcs"
                onChange={(e) => update(i, { pieces: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                disabled={disabled}
                aria-label={`Pieces in ${b.code || 'uncoded batch'}`}
                className="w-full min-w-0 px-2 py-1.5 text-sm text-right border-2 border-gray-300 rounded-lg bg-white focus:border-orange-500 focus:outline-none disabled:bg-gray-100 tabular-nums"
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(batches.filter((_, j) => j !== i))}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0"
                  aria-label={`Remove ${b.code || 'this row'}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!disabled && (
        pickingLeftover ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              list={`leftover-${key}-${date}`}
              value={leftoverPick}
              onChange={(e) => setLeftoverPick(e.target.value)}
              placeholder="Batch the stuffing came from"
              className="w-full min-w-0 px-2 py-1.5 text-sm font-mono border-2 border-gray-300 rounded-lg bg-white focus:border-orange-500 focus:outline-none"
            />
            <datalist id={`leftover-${key}-${date}`}>
              {earlierBatchCodes.map((c) => <option key={c} value={c} />)}
            </datalist>
            <button type="button" onClick={addLeftover} className="px-2.5 py-1.5 text-xs font-semibold bg-gray-900 text-white rounded-lg flex-shrink-0">Add</button>
            <button type="button" onClick={() => setPickingLeftover(false)} className="px-2 py-1.5 text-xs text-gray-600 flex-shrink-0">Cancel</button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addBatch}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-300 text-gray-800 hover:bg-gray-50"
            >
              <Plus className="w-3.5 h-3.5" /> Batch {batchCode(date, key, nextBatchNumber(batches, date, key)).split('-').pop()}
            </button>
            <button
              type="button"
              onClick={() => { setPickingLeftover(true); setLeftoverPick(earlierBatchCodes[0] || ''); }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-300 text-gray-800 hover:bg-gray-50"
              title="Momos folded today from stuffing left over from an earlier batch"
            >
              <RotateCcw className="w-3.5 h-3.5" /> From leftover
            </button>
          </div>
        )
      )}
    </div>
  );
}
