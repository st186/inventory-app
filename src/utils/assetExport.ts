// Asset register as flat rows for CSV / XLSX (convertToCSV in utils/export.ts, or
// XLSX.utils.json_to_sheet), so the export packs can carry an equipment register sheet.
// Disposed items stay in (with their condition) for a full history; items removed as "not
// equipment" are left out. Photos are not exported - their links expire after an hour.
import { assetCategoryLabel, assetConditionLabel, type Asset } from './assetRules';

export const ASSET_REGISTER_HEADERS = [
  'Location', 'Location type', 'Item', 'Category', 'Quantity', 'Unit cost (₹)', 'Total cost (₹)',
  'Purchase date', 'Condition', 'Disposed on', 'Source', 'Needs review', 'Notes', 'Last updated',
] as const;

export type AssetRegisterRow = Record<(typeof ASSET_REGISTER_HEADERS)[number], string | number>;

export function assetsToRows(
  assets: Asset[],
  locations: { kind: string; id: string; name: string }[] = [],
): AssetRegisterRow[] {
  const nameOf = (a: Asset) => locations.find((l) => l.kind === a.locationKind && l.id === a.locationId)?.name || a.locationId || 'Not set';
  return (assets || [])
    .filter((a) => a && !a.dismissed)
    .map((a) => ({
      Location: nameOf(a),
      'Location type': a.locationKind === 'production_house' ? 'Production house' : 'Store',
      Item: a.name,
      Category: assetCategoryLabel(a.category),
      Quantity: a.quantity,
      'Unit cost (₹)': a.unitCost ?? '',
      'Total cost (₹)': a.totalCost ?? '',
      'Purchase date': a.purchaseDate || '',
      Condition: assetConditionLabel(a.condition),
      'Disposed on': a.disposedAt ? a.disposedAt.slice(0, 10) : '',
      Source: a.source?.kind === 'expense' ? `Expense ${a.source.expenseId || ''}`.trim() : 'Listed by hand',
      'Needs review': a.needsReview || a.expenseChanged ? 'Yes' : 'No',
      Notes: a.notes || '',
      'Last updated': (a.updatedAt || '').slice(0, 10),
    }))
    .sort((x, y) => String(x.Location).localeCompare(String(y.Location)) || String(x.Category).localeCompare(String(y.Category)) || String(x.Item).localeCompare(String(y.Item)));
}
