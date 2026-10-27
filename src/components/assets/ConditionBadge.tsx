import { ASSET_CONDITIONS, type AssetCondition } from '../../utils/assetRules';

export const CONDITION_STYLE: Record<AssetCondition, string> = {
  good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  needs_repair: 'bg-amber-50 text-amber-800 border-amber-300',
  broken: 'bg-red-50 text-red-700 border-red-200',
  disposed: 'bg-gray-100 text-gray-500 border-gray-200',
};

export function ConditionBadge({ condition, bn = false }: { condition: AssetCondition; bn?: boolean }) {
  const c = ASSET_CONDITIONS.find((x) => x.key === condition) || ASSET_CONDITIONS[0];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${CONDITION_STYLE[c.key]}`}>
      {c.label}{bn ? ` · ${c.bn}` : ''}
    </span>
  );
}
