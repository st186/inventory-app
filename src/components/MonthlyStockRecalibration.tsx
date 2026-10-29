import { useState, useEffect } from 'react';
import { ClipboardList } from 'lucide-react';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { EmptyState } from './ui/empty-state';
import { ErrorState } from './ui/error-state';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { ResponsiveModal } from './ui/responsive-modal';
import { SegmentedControl } from './ui/segmented-control';
import { SkeletonListRows, SkeletonStatTiles } from './ui/skeleton';
import { StatTile } from './ui/stat-tile';
import { t as tSaved, useT } from '../utils/i18n';
import { momoName } from './stock/stockShared';
import * as api from '../utils/api';
import { formatDateTimeIST } from '../utils/timezone';
import { InventoryContextType } from '../App';
import { eventsApi } from '../utils/eventsApi';
import type { MomoCounts } from './stock/recalibrationMath';
import { countKey, houseExpected, lastCount, storeExpected } from './stock/countMath';
import { countHistory, storeWastageSince } from './stock/countData';

type RecalibrationItem = {
 itemId: string;
 itemName: string;
 category: string;
 unit: string;
 systemQuantity: number;
 actualQuantity: number;
 difference: number;
 adjustmentType: 'wastage' | 'counting_error' | null;
 notes: string;
};

type Props = {
 context: InventoryContextType;
 selectedStoreId?: string | null;
 onClose: () => void;
 onSaveSuccess?: () => void; // NEW: Callback to trigger refresh after save
 isProductionHouse?: boolean; // Flag to indicate if this is for production house stock
 isStoreFinishedProducts?: boolean; // NEW: Flag to indicate if this is for store's finished momo products
};

export function MonthlyStockRecalibration({ 
 context,
 selectedStoreId,
 onClose,
 onSaveSuccess,
 isProductionHouse,
 isStoreFinishedProducts = false,
}: Props) {
 const { t, lang } = useT();
 const [open, setOpen] = useState(true);
 // What is typed in a count box (kept as text while typing, e.g. "12.").
 const [drafts, setDrafts] = useState<Record<string, string>>({});
 const [items, setItems] = useState<RecalibrationItem[]>([]);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [lastRecalibration, setLastRecalibration] = useState<string | null>(null); // raw materials
 // The count the expected figures start from (India time), null when there was none.
 const [baseDate, setBaseDate] = useState<string | null>(null);
 // Momo count boxes nobody has typed in yet.
 const [blank, setBlank] = useState<Record<string, boolean>>({});
 const [error, setError] = useState<string | null>(null);
 const [success, setSuccess] = useState(false);
 
 const effectiveStoreId = selectedStoreId || context.user?.storeId;
 const store = context.stores?.find(s => s.id === effectiveStoreId);
 
 // NEW: Handle production house lookup separately
 const effectiveLocationId = selectedStoreId || context.user?.storeId;
 const location = isProductionHouse 
 ? context.productionHouses?.find(ph => ph.id === effectiveLocationId)
 : context.stores?.find(s => s.id === effectiveLocationId);
 const locationName = isProductionHouse 
 ? (location as any)?.name 
 : (location as any)?.name;
 
 const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
 const currentDay = new Date().getDate();
 // CHANGED: Enable recalibration for the entire month for Store Incharges
 const isRecalibrationWindow = true; // Always allow recalibration

 useEffect(() => {
 loadInventoryData();
 if (!isProductionHouse && !isStoreFinishedProducts) checkLastRecalibration();
 }, []);

 async function loadInventoryData() {
 try {
 setLoading(true);
 
 if (isProductionHouse || isStoreFinishedProducts) {
 // Load finished momo products stock (for production houses OR stores)
 await loadProductionHouseStock();
 } else {
 // Load regular inventory (raw materials)
 const inventory = await api.fetchInventory(context.user?.accessToken || '');
 
 // Filter based on store or production house
 const filteredInventory = inventory.filter(item => {
 if (effectiveStoreId) return item.storeId === effectiveStoreId;
 return false;
 });

 // Deduplicate items by itemId (keep only unique items)
 const uniqueItemsMap = new Map<string, typeof filteredInventory[0]>();
 filteredInventory.forEach(item => {
 // If item doesn't exist in map, or this item is more recent, keep it
 if (!uniqueItemsMap.has(item.id)) {
 uniqueItemsMap.set(item.id, item);
 }
 });

 // Convert to recalibration items
 const recalItems: RecalibrationItem[] = Array.from(uniqueItemsMap.values()).map(item => ({
 itemId: item.id,
 itemName: item.itemName,
 category: item.category,
 unit: item.unit,
 systemQuantity: item.quantity,
 actualQuantity: item.quantity, // Default to system quantity
 difference: 0,
 adjustmentType: null,
 notes: ''
 }));

 setItems(recalItems);
 }
 } catch (err) {
 console.error('Error loading inventory:', err);
 setError(tSaved('stock.count.loadFailed'));
 } finally {
 setLoading(false);
 }
 }

 // Expected stock = the last count that wasn't rejected + everything that moved after it
 // (stock/countMath.ts): for a store, momos received - sold - wastage logged; for a production
 // house, momos made (net of kurkure) - sent, plus event leftovers counted back in.
 async function loadProductionHouseStock() {
 const token = context.user?.accessToken || '';
 const inventoryItems = context.inventoryItems || [];
 let expected: MomoCounts;
 let linkedId: string | null | undefined = effectiveStoreId;

 if (isStoreFinishedProducts) {
 const storeId = effectiveStoreId || '';
 const base = lastCount(await countHistory(token, [storeId], 'store'), inventoryItems);
 const wastage = await storeWastageSince(token, storeId, base);
 expected = storeExpected({ base, storeId, requests: context.productionRequests || [], sales: context.categorySalesData || [], wastage }).expected;
 setBaseDate(base?.date || null);
 } else {
 // A production incharge's id can be the house's own or a store linked to it; counts and
 // older records are saved under either.
 const house = context.productionHouses?.find(ph => ph.id === effectiveStoreId);
 const houseId = house?.id || context.stores?.find(s => s.id === effectiveStoreId)?.productionHouseId || effectiveStoreId;
 linkedId = houseId;
 // Fresh and unfiltered (the app's copy may be cut to a date range).
 let productionData: any[];
 try {
 productionData = await api.fetchProductionData();
 } catch {
 productionData = context.productionData || [];
 }
 let returns: any[] = [];
 try {
 returns = await eventsApi.momoReturns('received');
 } catch {
 returns = [];
 }
 const base = lastCount(await countHistory(token, [houseId, effectiveStoreId], 'production_house'), inventoryItems);
 expected = houseExpected({
 base,
 ids: { productionHouseUUID: houseId, effectiveStoreId, originalStoreId: effectiveStoreId },
 productionData,
 requests: context.productionRequests || [],
 stores: context.stores || [],
 returns,
 }).expected;
 setBaseDate(base?.date || null);
 }

 const finishedProducts = inventoryItems.filter(item =>
 item.category === 'finished_product' &&
 item.isActive &&
 (item.linkedEntityType === 'global' ||
 (item.linkedEntityType === 'production_house' && item.linkedEntityId === linkedId) ||
 (item.linkedEntityType === 'store' && item.linkedEntityId === effectiveStoreId))
 );

 // Count boxes start empty: every momo has to be counted, not sent as the app's figure.
 setItems(finishedProducts.map(item => {
 const systemQuantity = expected[countKey(item.name)] || 0;
 return {
 itemId: item.name, // the name, as production data and requests key it
 itemName: item.displayName,
 category: item.category,
 unit: item.unit,
 systemQuantity,
 actualQuantity: systemQuantity,
 difference: 0,
 adjustmentType: null,
 notes: '',
 };
 }));
 setBlank(Object.fromEntries(finishedProducts.map(item => [item.name, true])));
 }

 async function checkLastRecalibration() {
 try {
 const locationId = effectiveStoreId;
 if (!locationId) return;

 // Determine the location type based on the component props
 const locationType = isProductionHouse ? 'production_house' : 'store';
 
 const result = await api.getLastRecalibration(context.user?.accessToken || '', locationId, locationType);
 if (result.lastRecalibration) {
 setLastRecalibration(result.lastRecalibration);
 }
 } catch (err) {
 console.error('Error checking last recalibration:', err);
 }
 }

 function handleActualQuantityChange(itemId: string, value: string) {
 const actualQty = parseFloat(value) || 0;
 setBlank((b) => ({ ...b, [itemId]: value.trim() === '' }));
 
 setItems(items.map(item => {
 if (item.itemId === itemId) {
 const diff = actualQty - item.systemQuantity;
 return {
 ...item,
 actualQuantity: actualQty,
 difference: diff,
 // Reset adjustment type if difference is 0
 adjustmentType: diff === 0 ? null : item.adjustmentType
 };
 }
 return item;
 }));
 }

 function handleAdjustmentTypeChange(itemId: string, type: 'wastage' | 'counting_error') {
 setItems(items.map(item => 
 item.itemId === itemId ? { ...item, adjustmentType: type } : item
 ));
 }

 function handleNotesChange(itemId: string, notes: string) {
 setItems(items.map(item => 
 item.itemId === itemId ? { ...item, notes } : item
 ));
 }

 async function handleSubmit() {
 if (Object.values(blank).some(Boolean)) {
 setError(tSaved('stock.count.fillAll'));
 return;
 }
 // Validate: items with difference must have adjustment type selected
 const invalidItems = items.filter(item => item.difference !== 0 && !item.adjustmentType);
 
 if (invalidItems.length > 0) {
 setError(tSaved('stock.count.pickWhy'));
 return;
 }

 try {
 setSaving(true);
 setError(null);

 console.log(`📊 Submitting recalibration:
 - locationId: ${effectiveLocationId}
 - locationType: ${isProductionHouse ? 'production_house' : 'store'}
 - locationName: ${locationName}
 - isProductionHouse: ${isProductionHouse}`);

 const recalibrationData = {
 locationId: effectiveLocationId || '',
 locationType: (isProductionHouse ? 'production_house' : 'store') as 'store' | 'production_house',
 locationName: locationName,
 items: items.map(item => ({
 itemId: item.itemId,
 itemName: item.itemName,
 category: item.category,
 unit: item.unit,
 systemQuantity: item.systemQuantity,
 actualQuantity: item.actualQuantity,
 difference: item.difference,
 adjustmentType: item.adjustmentType,
 notes: item.notes
 }))
 };

 await api.submitStockRecalibration(context.user?.accessToken || '', recalibrationData);
 
 setSuccess(true);
 setTimeout(() => {
 setOpen(false);
 if (onSaveSuccess) onSaveSuccess();
 }, 2000);
 
 } catch (err) {
 console.error('Error submitting recalibration:', err);
 setError(err instanceof Error ? err.message : tSaved('stock.count.failed'));
 } finally {
 setSaving(false);
 }
 }

 const totalItems = items.length;
 const itemsWithDifference = items.filter(item => item.difference !== 0).length;
 const totalWastage = items
 .filter(item => item.adjustmentType === 'wastage' && item.difference < 0)
 .reduce((sum, item) => sum + Math.abs(item.difference), 0);

 const dirty = items.some((item) => item.actualQuantity !== item.systemQuantity || item.notes !== '');

 return (
 <ResponsiveModal
 open={open}
 onOpenChange={(o) => { if (!o) setOpen(false); }}
 onClosed={onClose}
 dirty={dirty && !saving && !success}
 title={t('stock.count.sheetTitle')}
 description={`${locationName || store?.name || ''} · ${currentMonth}`}
 size="detail"
 footer={success ? undefined : (
 <Button size="lg" className="flex-1" loading={saving} disabled={loading} onClick={handleSubmit}>{t('stock.count.submit')}</Button>
 )}
 >
 <div className="flex flex-col gap-5" lang={lang}>
 {success ? (
 <Callout tone="success" title={t('stock.count.sent')} live>{t('stock.count.sentBody')}</Callout>
 ) : loading ? (
 <>
 <SkeletonStatTiles count={2} />
 <SkeletonListRows count={5} leading="none" />
 </>
 ) : (
 <>
 <div className="grid grid-cols-3 gap-3">
 <StatTile label={t('stock.count.items')} value={<span className="num">{totalItems}</span>} />
 <StatTile label={t('stock.count.withDiff')} value={<span className="num">{itemsWithDifference}</span>} />
 <StatTile label={t('stock.count.wasted')} value={<span className="num">{totalWastage.toFixed(2)}</span>} tone={totalWastage > 0 ? 'danger' : 'default'} />
 </div>
 {lastRecalibration && <p className="text-label text-text-3">{t('stock.count.last', { when: formatDateTimeIST(lastRecalibration, false) })}</p>}
 {(isProductionHouse || isStoreFinishedProducts) && (
 <p className="text-label text-text-3">
 {baseDate
 ? t(isStoreFinishedProducts ? 'stock.count.basisStore' : 'stock.count.basisHouse', { when: formatDateTimeIST(`${baseDate}Z`, false) })
 : t('stock.count.basisNone')}
 {' '}{t('stock.count.countAfter')}
 </p>
 )}
 <Callout tone="info" title={t('stock.count.approvalNote')} />

 {items.length === 0 ? (
 <EmptyState compact icon={ClipboardList} title={t('stock.onHand.emptyTitle')} />
 ) : (
 <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
 {items.map((item) => (
 <div key={item.itemId} className="flex flex-col gap-3 px-4 py-3">
 <div className="flex items-center gap-3">
 <span className="flex min-w-0 flex-1 flex-col">
 <span className="text-body-md font-medium text-text">{momoName(lang, item.itemId.replace(/_momos?$/i, '').replace(/_([a-z])/g, (g) => g[1].toUpperCase()), item.itemName)}</span>
 <span className="num text-label text-text-3">{t('stock.count.expected', { n: `${item.systemQuantity} ${item.unit}` })}</span>
 {item.difference !== 0 && (
 <span className={`num text-label font-semibold ${item.difference < 0 ? 'text-danger' : 'text-success'}`}>
 {t('stock.count.diff', { n: `${item.difference > 0 ? '+' : ''}${item.difference.toFixed(2)}` })}
 </span>
 )}
 </span>
 <Input
 type="text"
 inputMode="decimal"
 aria-label={`${item.itemName} · ${t('stock.count.counted')}`}
 value={drafts[item.itemId] ?? (blank[item.itemId] ? '' : String(item.actualQuantity))}
 placeholder="0"
 onChange={(e) => {
 const v = e.target.value.replace(/[^\d.-]/g, '');
 setDrafts((d) => ({ ...d, [item.itemId]: v }));
 handleActualQuantityChange(item.itemId, v);
 }}
 onBlur={() => setDrafts((d) => { const next = { ...d }; delete next[item.itemId]; return next; })}
 className="num w-24 text-right"
 />
 </div>
 {item.difference !== 0 && (
 <>
 <SegmentedControl
 aria-label={t('stock.count.why')}
 size="sm"
 value={item.adjustmentType || ''}
 onValueChange={(v) => handleAdjustmentTypeChange(item.itemId, v as 'wastage' | 'counting_error')}
 options={[{ value: 'wastage', label: t('stock.count.wastage') }, { value: 'counting_error', label: t('stock.count.countingError') }]}
 />
 <Field label={t('stock.count.notes')} optional>
 <Input value={item.notes} onChange={(e) => handleNotesChange(item.itemId, e.target.value)} />
 </Field>
 </>
 )}
 </div>
 ))}
 </div>
 )}

 {error && <ErrorState title={t('stock.count.failed')} body={error} />}
 </>
 )}
 </div>
 </ResponsiveModal>
 );
}
