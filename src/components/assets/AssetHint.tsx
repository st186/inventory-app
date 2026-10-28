import { Boxes } from 'lucide-react';
import { ASSETS_FROM_DATE, looksLikeEquipment } from '../../utils/assetRules';
import { useT } from '../../utils/i18n';

// Under the item in the expense forms: tells the person a steamer, bin or pan they are logging
// will also show up in Equipment & assets for review (the server's reconcile adds it; same rules).
export function AssetHint({ name, category, source, date }: { name: string; category: string; source: string; date?: string }) {
  const { t } = useT();
  if (date && date < ASSETS_FROM_DATE) return null;
  if (!looksLikeEquipment(name, category, source)) return null;
  return (
    <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-info-border bg-info-soft px-2.5 py-1.5 text-caption text-info">
      <Boxes className="size-4 shrink-0" aria-hidden="true" /> {t('assets.hint')}
    </p>
  );
}
