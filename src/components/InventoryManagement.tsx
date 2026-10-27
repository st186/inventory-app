// Expenses (Money > Expenses, wireframe Expenses): Store / Production / All, the day's spend,
// price checks, the day's entries by type, and the Add expense button. Totals come from
// money/expenseMath.ts; new entries go through the outbox (App.tsx saveViaOutbox).
import { useState, useMemo, useCallback } from 'react';
import { InventoryContextType, InventoryItem, OverheadItem, FixedCostItem } from '../App';
import { Employee } from '../utils/api';
import * as api from '../utils/api';
import { PRODUCTION_CASH_GO_LIVE_DATE, storeCashOnHand } from '../utils/cashSource';
import { useCashCover } from './useCashCover';
import { InventoryForm } from './InventoryForm';
import { OverheadForm } from './OverheadForm';
import { FixedCostForm } from './FixedCostForm';
import { QuickAddExpense } from './QuickAddExpense';
import { InventoryList, PaidByChip } from './InventoryList';
import { Building2, Package, Plus, Receipt, ScanText, Search, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { getTodayIST, formatDateIST } from '../utils/timezone';
import { CategoryManagerModal } from './CategoryManagerModal';
import { InvoiceScanner } from './insights/InvoiceScanner';
import { PriceCheckPanel } from './PriceCheck';
import { buildPriceGuide, checkPurchase, type PriceFlag } from '../utils/expenseChecks';
import { belongsToTab, combinedDayExpenses, dayExpenses, makeScopeMatcher } from './money/expenseMath';
import { useT } from '../utils/i18n';
import { Button } from './ui/button';
import { EmptyState } from './ui/empty-state';
import { IconButton } from './ui/icon-button';
import { Input } from './ui/input';
import { IconWell, ListGroup, ListRow } from './ui/list-row';
import { Money, formatINR } from './ui/money';
import { ResponsiveModal } from './ui/responsive-modal';
import { SegmentedControl } from './ui/segmented-control';
import { StatGrid, StatSplit, StatTile } from './ui/stat-tile';
import { ExtendedFab, FabSpacer, MoneyPage } from './money/MoneyLayout';
import { DayBand, MoneyWaiting } from './money/DayCloseParts';
import { categoryIcon, categoryText, stripEmoji } from './money/categoryDisplay';
import { useUndoableDelete } from './money/useUndoableDelete';

// Invoice scanning is on (about ₹0.03 a bill on Haiku). The server can still switch it off with
// its AI_INVOICE_SCAN secret set to "off" (see insights.ts).
const INVOICE_SCAN_ENABLED = true;

type Props = {
 context: InventoryContextType;
 selectedStoreId?: string | null;
 employees: Employee[];
};

export function InventoryManagement({ context, selectedStoreId, employees }: Props) {
 const [selectedDate, setSelectedDate] = useState<string>(
 getTodayIST()
 );
 const [showInventoryForm, setShowInventoryForm] = useState(false);
 const [showOverheadForm, setShowOverheadForm] = useState(false);
 const [showFixedCostForm, setShowFixedCostForm] = useState(false);
 const [showQuickAdd, setShowQuickAdd] = useState(false);
 const [showInvoiceScan, setShowInvoiceScan] = useState(false);
 const [editingInventory, setEditingInventory] = useState<InventoryItem | null>(null);
 const [editingOverhead, setEditingOverhead] = useState<OverheadItem | null>(null);
 const [editingFixedCost, setEditingFixedCost] = useState<FixedCostItem | null>(null);
 const [showSearchModal, setShowSearchModal] = useState(false);
 const [searchQuery, setSearchQuery] = useState('');
 const [showCategoryManager, setShowCategoryManager] = useState(false);

 const isProductionIncharge = context.user?.designation === 'production_incharge';
 const isStoreIncharge = context.user?.designation === 'store_incharge';
 // Operations head (e.g. Aniket) works production-house-side day to day, so default
 // and lead with that tab for them, same as the production incharge.
 const isOperationsHead = context.user?.designation === 'operations_incharge';
 // Operations manager: any other manager (not tied to a single store or production house).
 const isOperationsManager = context.user?.role === 'manager' && !isStoreIncharge && !isProductionIncharge;
 // The cluster head can add expenses for any store or production house (often paid with
 // their own money - the "My own money" payment option).
 const isClusterHead = context.user?.role === 'cluster_head';
 const defaultsToProduction = isProductionIncharge || isOperationsHead;
 const [activeTab, setActiveTab] = useState<'store' | 'production' | 'combined'>(
 defaultsToProduction ? 'production' : 'store'
 );
 // Items saved before this split lack entityType - treated as store expenses (money/expenseMath.ts).


 const formatDate = (dateStr: string) => {
 return formatDateIST(dateStr);
 };

 // Use selectedStoreId prop (from store selector) OR fallback to user's storeId
 // This allows cluster heads to view data for any selected store
 const effectiveStoreId = selectedStoreId || context.user?.storeId;

 // Operations manager can edit both tabs; production incharge only production; store
 // incharge only their own store's store-tab entries (not other stores, not production).
 // The combined summary tab is read-only - nothing gets added while it's active.
 const canAddOnActiveTab = activeTab === 'combined'
 ? false
 : activeTab === 'production'
 ? (isProductionIncharge || isOperationsManager || isClusterHead)
 : (isClusterHead || ((context.isManager || isStoreIncharge) && !isProductionIncharge && (!isStoreIncharge || effectiveStoreId === context.user?.storeId)));
 // Stores the cluster head can file a store expense under, when no single store is selected.
 const clusterStoreOptions = isClusterHead ? (context.stores || []).map((st) => ({ id: st.id, name: st.name })) : undefined;
 const defaultStoreForAdds = effectiveStoreId || (isClusterHead ? ((context.stores || []).find((st) => st.productionHouseId)?.id || context.stores?.[0]?.id) : undefined);
 // Cluster head: a store bill can be paid out of the store's linked production house's cash
 // in hand instead of the store's (utils/cashSource.ts).
 const productionHouseForStore = (storeId?: string | null): string | null =>
 (isClusterHead && storeId ? (context.stores || []).find((st) => st.id === storeId)?.productionHouseId : null) || null;
 const productionCashHouseFor = (editing?: { storeId?: string | null } | null) =>
 activeTab === 'store' ? productionHouseForStore(editing?.storeId || effectiveStoreId || defaultStoreForAdds) : null;

 // What the store's own till and its production house's till hold on a date - production's
 // cash only steps in for a store bill the store's cash can't cover (utils/cashSource.ts).
 const accessToken = context.user?.accessToken;
 const loadCashCover = useCallback(async (storeId: string, date: string) => {
 const houseId = (context.stores || []).find((st) => st.id === storeId)?.productionHouseId;
 if (!houseId || !accessToken || date < PRODUCTION_CASH_GO_LIVE_DATE) return null;
 const [production, topups] = await Promise.all([
 api.getProductionCashEntry(accessToken, houseId, date),
 api.fetchCashTopupRequests(accessToken),
 ]);
 const productionCash = production.entry
 ? production.entry.actualCashInHand ?? production.entry.expectedClosingCashInHand
 : production.live?.expectedClosingCashInHand ?? 0;
 const store = storeCashOnHand({
 storeId, date, salesData: context.salesData || [], topups,
 expenses: [...context.inventory, ...context.overheads, ...context.fixedCosts],
 });
 return { storeCash: store.cash, productionCash, storeCounted: store.counted };
 }, [accessToken, context.stores, context.salesData, context.inventory, context.overheads, context.fixedCosts]);

 // For the edit forms: the cash on the edited store bill's day.
 const editingStoreBill = editingInventory || editingOverhead || editingFixedCost;
 const editFormOpen = showInventoryForm || showOverheadForm || showFixedCostForm;
 const editCashHouseId = editFormOpen ? productionCashHouseFor(editingStoreBill) : null;
 const editCashCover = useCashCover(
 editCashHouseId ? loadCashCover : undefined,
 editCashHouseId ? (editingStoreBill?.storeId || effectiveStoreId || defaultStoreForAdds || null) : null,
 editingStoreBill?.date || selectedDate
 );

 // Which production house new production-tab entries should be tagged with - the
 // production incharge's own house, or (for an operations manager editing on their
 // behalf) the only production house this business currently has.
 const targetProductionHouseId = isProductionIncharge ? (context.user?.storeId || undefined) : context.productionHouses?.[0]?.id;
 // An edited entry keeps its own store when no single store is selected (cluster head on "All stores").
 const getEntityFields = (existing?: { storeId?: string | null } | null): { entityType: 'store' | 'production_house'; storeId?: string; productionHouseId?: string } =>
 activeTab === 'production'
 ? { entityType: 'production_house', productionHouseId: targetProductionHouseId }
 : { entityType: 'store', storeId: effectiveStoreId || existing?.storeId || defaultStoreForAdds || undefined };

 // Production-house-tagged items are matched by productionHouseId, store items by storeId.
 const matchesEffectiveScope = makeScopeMatcher(effectiveStoreId, targetProductionHouseId);


 const day = dayExpenses({
 inventory: context.inventory, overheads: context.overheads, fixedCosts: context.fixedCosts,
 selectedDate, tab: activeTab, matchesScope: matchesEffectiveScope,
 });
 const filteredInventory = day.inventory;
 const filteredOverheads = day.overheads;
 const filteredFixedCosts = day.fixedCosts;
 const totalInventoryCost = day.inventoryTotal;
 const totalOverheadCost = day.overheadTotal;
 const totalFixedCost = day.fixedTotal;

 // Combined Store + Production House totals for the selected date, independent of
 // which single-entity tab is active - powers the "Total Purchases" summary tab.
 const combinedTotals = useMemo(() => combinedDayExpenses({
 inventory: context.inventory, overheads: context.overheads, fixedCosts: context.fixedCosts,
 selectedDate, matchesScope: matchesEffectiveScope,
 }),
 // eslint-disable-next-line react-hooks/exhaustive-deps
 [context.inventory, context.overheads, context.fixedCosts, selectedDate, effectiveStoreId, targetProductionHouseId]);

 // What each item usually costs, from every purchase on record - powers the price warnings
 // while adding and the "purchases look wrong" list (utils/expenseChecks.ts).
 const priceGuide = useMemo(() => buildPriceGuide(context.inventory), [context.inventory]);
 const priceCheckEntries = useMemo(
 () => context.inventory.filter((item) => matchesEffectiveScope(item) && belongsToTab(item, activeTab)),
 // eslint-disable-next-line react-hooks/exhaustive-deps
 [context.inventory, effectiveStoreId, targetProductionHouseId, activeTab]
 );
 const dayPriceFlags = useMemo(() => {
 const flags = new Map<string, PriceFlag>();
 for (const item of filteredInventory) {
 const flag = checkPurchase(item, priceGuide);
 if (flag) flags.set(item.id, flag);
 }
 return flags;
 }, [filteredInventory, priceGuide]);
 // Only the entry's quantity/unit (or the "it's right" mark) changes - never the amount paid.
 const savePriceFix = async (item: InventoryItem, changes: { quantity: number; unit: string } | { priceCheckOk: true }) => {
 const { id, ...rest } = item;
 const next = { ...rest, ...changes };
 if ('quantity' in changes) next.costPerUnit = Math.round((next.totalCost / changes.quantity) * 100) / 100;
 await context.updateInventoryItem(id, next);
 toast.success('priceCheckOk' in changes ? `${item.itemName} marked as right` : `${item.itemName} changed to ${changes.quantity} ${changes.unit}`);
 };

 // Search results across ALL inventory (not date-filtered)
 const searchResults = useMemo(() => {
 if (!searchQuery.trim()) return [];
 const q = searchQuery.toLowerCase().trim();
 return context.inventory
 .filter(item => {
 // Matched by entity like the lists above: production-house rows have no storeId, so
 // comparing storeId found nothing on the Production House tab.
 const nameMatch = item.itemName.toLowerCase().includes(q);
 return matchesEffectiveScope(item) && nameMatch && belongsToTab(item, activeTab);
 })
 .sort((a, b) => b.date.localeCompare(a.date));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [searchQuery, context.inventory, effectiveStoreId, targetProductionHouseId, activeTab]);

 // Group search results by item name for summary
 const searchSummary = useMemo(() => {
 if (searchResults.length === 0) return null;
 const totalSpent = searchResults.reduce((sum, item) => sum + item.totalCost, 0);
 const totalQty = searchResults.reduce((sum, item) => sum + item.quantity, 0);
 const rates = searchResults.map(item => item.costPerUnit);
 const minRate = Math.min(...rates);
 const maxRate = Math.max(...rates);
 const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
 return { totalSpent, totalQty, minRate, maxRate, avgRate, count: searchResults.length };
 }, [searchResults]);

 // ---- Expenses screen (wireframe Expenses) ------------------------------------------------
 const { t, lang } = useT();
 const { hidden, remove } = useUndoableDelete();
 const tabOrder: ('store' | 'production' | 'combined')[] = defaultsToProduction ? ['production', 'store', 'combined'] : ['store', 'production', 'combined'];
 const tabLabel = (tab: 'store' | 'production' | 'combined') => (tab === 'combined' ? t('exp.all') : tab === 'production' ? t('exp.production') : t('exp.store'));
 const dateLabel = formatDateIST(selectedDate);
 const visibleCount = [...filteredInventory, ...filteredOverheads, ...filteredFixedCosts].filter((x) => !hidden.has(x.id)).length;
 const addDisabledReason = activeTab === 'combined' ? t('exp.cantAddAll') : activeTab === 'production' ? t('exp.cantAddProduction') : t('exp.cantAddStore');
 const closeEdit = () => {
 setShowInventoryForm(false);
 setShowOverheadForm(false);
 setShowFixedCostForm(false);
 setEditingInventory(null);
 setEditingOverhead(null);
 setEditingFixedCost(null);
 };
 // Delete from inside the edit sheet: confirm, close the sheet, then a few seconds of Undo.
 const deleteFromSheet = (id: string, what: string, doDelete: (id: string) => void | Promise<void>) => async () => {
 const started = await remove(id, what, () => doDelete(id));
 if (started) closeEdit();
 };

 return (
 <MoneyPage wide lang={lang}>
 <DayBand value={selectedDate} onChange={setSelectedDate} />

 <div className="flex items-center gap-2">
 <SegmentedControl
 aria-label={t('exp.where')}
 className="flex-1"
 value={activeTab}
 onValueChange={setActiveTab}
 options={tabOrder.map((tab) => ({ value: tab, label: tabLabel(tab) }))}
 />
 <IconButton label={t('exp.search')} icon={<Search />} onClick={() => setShowSearchModal(true)} />
 </div>

 <MoneyWaiting kinds={['inventory', 'overhead', 'fixed-cost']} date={selectedDate} />

 {activeTab === 'combined' ? (
 <>
 <StatTile hero label={t('exp.spentOn', { date: dateLabel })} value={<Money value={combinedTotals.store.total + combinedTotals.production.total} />}>
 <StatSplit items={[
 { label: t('exp.storeSide'), value: formatINR(combinedTotals.store.total) },
 { label: t('exp.productionSide'), value: formatINR(combinedTotals.production.total) },
 ]} />
 </StatTile>
 {(['store', 'production'] as const).map((key) => {
 const data = combinedTotals[key];
 return (
 <ListGroup key={key} title={key === 'store' ? t('exp.storeSide') : t('exp.productionSide')} meta={formatINR(data.total)}>
 <ListRow icon={Package} title={t('exp.ingredients')} subtitle={t('exp.itemsCount', { n: data.inventory.items.length })} amount={data.inventory.total} onClick={() => setActiveTab(key)} />
 <ListRow icon={Receipt} title={t('exp.running')} subtitle={t('exp.itemsCount', { n: data.overhead.items.length })} amount={data.overhead.total} onClick={() => setActiveTab(key)} />
 <ListRow icon={Building2} title={t('exp.fixedCosts')} subtitle={t('exp.itemsCount', { n: data.fixedCost.items.length })} amount={data.fixedCost.total} onClick={() => setActiveTab(key)} />
 </ListGroup>
 );
 })}
 </>
 ) : (
 <>
 {/* One number to glance at, with the type split under it. */}
 <StatTile hero label={t('exp.spentOn', { date: dateLabel })} value={<Money value={totalInventoryCost + totalOverheadCost + totalFixedCost} />}>
 <StatSplit items={[
 { label: t('exp.ingredients'), value: formatINR(totalInventoryCost) },
 { label: t('exp.running'), value: formatINR(totalOverheadCost) },
 { label: t('exp.fixed'), value: formatINR(totalFixedCost) },
 ]} />
 </StatTile>

 {canAddOnActiveTab && (
 <PriceCheckPanel
 entries={priceCheckEntries}
 guide={priceGuide}
 onSave={savePriceFix}
 onEdit={(item) => {
 setEditingInventory(item);
 setShowInventoryForm(true);
 }}
 />
 )}

 {visibleCount === 0 ? (
 <EmptyState
 icon={Receipt}
 title={t('exp.empty', { date: dateLabel })}
 body={t('exp.emptyBody')}
 action={canAddOnActiveTab ? <Button variant="secondary" leadingIcon={<Plus />} onClick={() => setShowQuickAdd(true)}>{t('expense.add')}</Button> : undefined}
 />
 ) : (
 <InventoryList
 inventory={filteredInventory}
 overheads={filteredOverheads}
 fixedCosts={filteredFixedCosts}
 hiddenIds={hidden}
 onEditInventory={(item) => {
 setEditingInventory(item);
 setShowInventoryForm(true);
 }}
 onEditOverhead={(item) => {
 setEditingOverhead(item);
 setShowOverheadForm(true);
 }}
 onEditFixedCost={(item) => {
 setEditingFixedCost(item);
 setShowFixedCostForm(true);
 }}
 isManager={canAddOnActiveTab}
 priceFlags={dayPriceFlags}
 />
 )}
 </>
 )}

 {/* Categories live under More > Catalogue for the owner; kept one tap away here too. */}
 {context.user?.role === 'cluster_head' && (
 <ListGroup>
 <ListRow icon={Settings} title={t('exp.manageCategories')} onClick={() => setShowCategoryManager(true)} />
 </ListGroup>
 )}

 <FabSpacer />
 <ExtendedFab
 label={t('expense.add')}
 onClick={() => setShowQuickAdd(true)}
 disabled={!canAddOnActiveTab}
 disabledReason={addDisabledReason}
 moreLabel={t('exp.moreWays')}
 more={INVOICE_SCAN_ENABLED ? [{ label: t('exp.scanInvoice'), icon: <ScanText className="size-5 text-text-2" />, onSelect: () => setShowInvoiceScan(true) }] : undefined}
 />

 {/* Search every date for an item: how often it was bought and at what price. */}
 <ResponsiveModal
 open={showSearchModal}
 onOpenChange={(open) => { setShowSearchModal(open); if (!open) setSearchQuery(''); }}
 title={t('exp.search')}
 size="detail"
 >
 <div className="flex flex-col gap-4">
 <Input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t('exp.searchPh')} aria-label={t('exp.search')} />
 {!searchQuery.trim() ? (
 <EmptyState compact icon={Search} title={t('exp.searchStart')} />
 ) : searchResults.length === 0 ? (
 <EmptyState compact icon={Search} title={t('exp.searchNone', { q: searchQuery })} />
 ) : (
 <>
 {searchSummary && (
 <StatGrid columns={4}>
 <StatTile label={t('exp.timesBought')} value={searchSummary.count} />
 <StatTile label={t('exp.totalSpent')} value={<Money value={searchSummary.totalSpent} />} />
 <StatTile label={t('exp.rateRange')} value={`${formatINR(Math.round(searchSummary.minRate))}–${formatINR(Math.round(searchSummary.maxRate))}`} />
 <StatTile label={t('exp.avgRate')} value={<Money value={Math.round(searchSummary.avgRate)} />} />
 </StatGrid>
 )}
 <ListGroup>
 {searchResults.map((item) => (
 <ListRow
 key={item.id}
 leading={<IconWell icon={categoryIcon(item.category, 'inventory')} />}
 title={item.itemName}
 subtitle={`${formatDate(item.date)} · ${item.quantity} ${item.unit} · ${formatINR(item.costPerUnit || 0)}/${item.unit} · ${categoryText(item.category)}`}
 chip={<PaidByChip item={item} />}
 amount={item.totalCost}
 />
 ))}
 </ListGroup>
 </>
 )}
 </div>
 </ResponsiveModal>

 {showInvoiceScan && (
 <InvoiceScanner
 context={context}
 selectedDate={selectedDate}
 defaultEntity={activeTab === 'production' ? 'production_house' : 'store'}
 storeId={effectiveStoreId || defaultStoreForAdds}
 productionHouseId={targetProductionHouseId}
 storeOptions={!effectiveStoreId ? clusterStoreOptions : undefined}
 allowOwnerPayment={isClusterHead}
 productionHouseForStore={productionHouseForStore}
 loadCashCover={loadCashCover}
 onClose={() => setShowInvoiceScan(false)}
 />
 )}

 {/* Add expense: the one smart entry point for new entries (Store / Production inside). */}
 {showQuickAdd && (
 <QuickAddExpense
 selectedDate={selectedDate}
 defaultEntity={activeTab === 'production' ? 'production_house' : 'store'}
 effectiveStoreId={effectiveStoreId || defaultStoreForAdds}
 targetProductionHouseId={targetProductionHouseId}
 canCreateNewItems={context.user?.role === 'cluster_head'}
 canUseRestrictedCategories={context.user?.role === 'cluster_head'}
 ownerPaymentOption={isClusterHead}
 storeOptions={!effectiveStoreId ? clusterStoreOptions : undefined}
 productionHouseForStore={productionHouseForStore}
 loadCashCover={loadCashCover}
 priceGuide={priceGuide}
 accessToken={accessToken}
 onClose={() => setShowQuickAdd(false)}
 onSubmitInventory={async (item) => {
 await context.addInventoryItem(item);
 toast.success(t('exp.saved'));
 }}
 onSubmitOverhead={async (item) => {
 await context.addOverheadItem(item);
 toast.success(t('exp.saved'));
 }}
 onSubmitFixedCost={async (item) => {
 await context.addFixedCostItem(item);
 toast.success(t('exp.saved'));
 }}
 />
 )}

 {/* Edit an entry: the type's own form in the same sheet look, with Delete in its header. */}
 {showInventoryForm && (
 <InventoryForm
 // An entry opened from the price-check list can be from another day - keep its own date.
 selectedDate={editingInventory?.date || selectedDate}
 editingItem={editingInventory}
 entityType={activeTab === 'production' ? 'production_house' : 'store'}
 canCreateNewItems={context.user?.role === 'cluster_head'}
 allowOwnerPayment={isClusterHead}
 productionCashHouseId={productionCashHouseFor(editingInventory)}
 productionCashCover={editCashCover}
 priceGuide={priceGuide}
 onDelete={editingInventory && canAddOnActiveTab ? deleteFromSheet(editingInventory.id, `${formatINR(editingInventory.totalCost)} · ${editingInventory.itemName} · ${formatDate(editingInventory.date)}`, context.deleteInventoryItem) : undefined}
 onSubmit={async (item) => {
 try {
 const taggedItem = { ...item, ...getEntityFields(editingInventory) };
 if (editingInventory) {
 await context.updateInventoryItem(editingInventory.id, taggedItem);
 setShowInventoryForm(false);
 setEditingInventory(null);
 toast.success('Inventory item updated');
 } else {
 await context.addInventoryItem(taggedItem);
 // Don't close the form for new items - let the user add more
 toast.success('Inventory item added - you can add another.');
 }
 } catch (error) {
 toast.error('Failed to save inventory item. Please try again.');
 }
 }}
 onClose={closeEdit}
 />
 )}

 {showOverheadForm && (
 <OverheadForm
 // An edited entry keeps its own date (it was saved under the page's selected date).
 selectedDate={editingOverhead?.date || selectedDate}
 editingItem={editingOverhead}
 employees={employees}
 existingOverheads={context.overheads}
 entityScope={activeTab === 'production' ? 'production' : 'store'}
 canUseRestrictedCategories={context.user?.role === 'cluster_head'}
 allowOwnerPayment={isClusterHead}
 productionCashHouseId={productionCashHouseFor(editingOverhead)}
 productionCashCover={editCashCover}
 onDelete={editingOverhead && canAddOnActiveTab ? deleteFromSheet(editingOverhead.id, `${formatINR(editingOverhead.amount)} · ${stripEmoji(editingOverhead.description) || categoryText(editingOverhead.category)} · ${formatDate(editingOverhead.date)}`, context.deleteOverheadItem) : undefined}
 onSubmit={async (item) => {
 try {
 const taggedItem = { ...item, ...getEntityFields(editingOverhead) };
 if (editingOverhead) {
 await context.updateOverheadItem(editingOverhead.id, taggedItem);
 } else {
 await context.addOverheadItem(taggedItem);
 }
 setShowOverheadForm(false);
 setEditingOverhead(null);
 toast.success('Running cost saved');
 } catch (error) {
 console.error('Error saving expense/overhead:', error);
 const errorMessage = error instanceof Error ? error.message : 'Failed to save expense/overhead cost. Please try again.';
 toast.error(errorMessage);
 }
 }}
 onClose={closeEdit}
 />
 )}

 {showFixedCostForm && (
 <FixedCostForm
 // An edited entry keeps its own date (it was saved under the page's selected date).
 selectedDate={editingFixedCost?.date || selectedDate}
 editingItem={editingFixedCost}
 allowOwnerPayment={isClusterHead}
 productionCashHouseId={productionCashHouseFor(editingFixedCost)}
 productionCashCover={editCashCover}
 onDelete={editingFixedCost && canAddOnActiveTab ? deleteFromSheet(editingFixedCost.id, `${formatINR(editingFixedCost.amount)} · ${categoryText(editingFixedCost.category)} · ${formatDate(editingFixedCost.date)}`, context.deleteFixedCostItem) : undefined}
 onSubmit={async (item) => {
 try {
 const taggedItem = { ...item, ...getEntityFields(editingFixedCost) };
 if (editingFixedCost) {
 await context.updateFixedCostItem(editingFixedCost.id, taggedItem);
 } else {
 await context.addFixedCostItem(taggedItem);
 }
 setShowFixedCostForm(false);
 setEditingFixedCost(null);
 toast.success('Fixed cost saved');
 } catch (error) {
 toast.error('Failed to save fixed cost. Please try again.');
 }
 }}
 onClose={closeEdit}
 />
 )}

 {showCategoryManager && (
 <CategoryManagerModal onClose={() => setShowCategoryManager(false)} />
 )}
 </MoneyPage>
 );
}
