import { AlertTriangle, Check, SearchX, Trash2, Wrench } from 'lucide-react';
import { ASSET_CONDITIONS, type AssetCondition } from '../../utils/assetRules';
import { StatusChip, type StatusTone } from '../ui/status-chip';
import { useT } from '../../utils/i18n';
import { conditionKey } from './assetLabels';

// Condition of a register item as a status chip: the word carries the meaning, the tone backs it.
export const CONDITION_TONE: Record<AssetCondition, StatusTone> = {
  good: 'success',
  needs_repair: 'warning',
  broken: 'danger',
  missing: 'danger',
  disposed: 'neutral',
};
const CONDITION_ICON = { good: Check, needs_repair: Wrench, broken: AlertTriangle, missing: SearchX, disposed: Trash2 } as const;

export function ConditionBadge({ condition }: { condition: AssetCondition; /** Kept for callers; the label is in the app language now. */ bn?: boolean }) {
  const { t } = useT();
  const c = ASSET_CONDITIONS.find((x) => x.key === condition) || ASSET_CONDITIONS[0];
  return (
    <StatusChip tone={CONDITION_TONE[c.key]} icon={CONDITION_ICON[c.key]}>
      {t(conditionKey(c.key))}
    </StatusChip>
  );
}
