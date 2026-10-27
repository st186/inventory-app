import { Boxes } from 'lucide-react';
import { ASSETS_FROM_DATE, looksLikeEquipment } from '../../utils/assetRules';

// Under the item in the expense forms: tells the person a steamer, bin or pan they are logging
// will also show up in Equipment & assets for review (the server's reconcile adds it; same rules).
export function AssetHint({ name, category, source, date }: { name: string; category: string; source: string; date?: string }) {
  if (date && date < ASSETS_FROM_DATE) return null;
  if (!looksLikeEquipment(name, category, source)) return null;
  return (
    <p className="mt-1.5 text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5">
      <Boxes className="w-3.5 h-3.5 flex-shrink-0" /> Will be added to Equipment & assets · সম্পদ তালিকায় যোগ হবে
    </p>
  );
}
