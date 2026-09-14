import { useState, useMemo, useEffect } from 'react';
import { InventoryContextType, InventoryItem, OverheadItem, FixedCostItem } from '../App';
import { Employee } from '../utils/api';
import { InventoryForm } from './InventoryForm';
import { OverheadForm } from './OverheadForm';
import { FixedCostForm } from './FixedCostForm';
import { QuickAddExpense } from './QuickAddExpense';
import { InventoryList } from './InventoryList';
import { DateSelector } from './DateSelector';
import { Plus, Search, Settings, Package } from 'lucide-react';
import { toast } from 'sonner';
import { getTodayIST, formatDateIST } from '../utils/timezone';
import { INVENTORY_CATEGORIES } from '../utils/inventoryData';
import { CategoryManagerModal } from './CategoryManagerModal';

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
 const defaultsToProduction = isProductionIncharge || isOperationsHead;
 const [activeTab, setActiveTab] = useState<'store' | 'production' | 'combined'>(
 defaultsToProduction ? 'production' : 'store'
 );
 // Items saved before this split lack entityType — treat those as store expenses.
 // 'combined' matches nothing here - the combined summary tab computes its own totals
 // per entity directly (see combinedTotals below) rather than filtering by activeTab.
 const belongsToTab = (item: { entityType?: 'store' | 'production_house' }, tab: 'store' | 'production' | 'combined') =>
 tab === 'production' ? item.entityType === 'production_house' : tab === 'store' ? item.entityType !== 'production_house' : false;

 const changeDate = (days: number) => {
 const current = new Date(selectedDate);
 current.setDate(current.getDate() + days);
 setSelectedDate(current.toISOString().split('T')[0]);
 };

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
 ? (isProductionIncharge || isOperationsManager)
 : (context.isManager && !isProductionIncharge && (!isStoreIncharge || effectiveStoreId === context.user?.storeId));

 // Which production house new production-tab entries should be tagged with - the
 // production incharge's own house, or (for an operations manager editing on their
 // behalf) the only production house this business currently has.
 const targetProductionHouseId = isProductionIncharge ? (context.user?.storeId || undefined) : context.productionHouses?.[0]?.id;
 const getEntityFields = (): { entityType: 'store' | 'production_house'; storeId?: string; productionHouseId?: string } =>
 activeTab === 'production'
 ? { entityType: 'production_house', productionHouseId: targetProductionHouseId }
 : { entityType: 'store', storeId: effectiveStoreId || undefined };

 // Production-house-tagged items carry a productionHouseId, not a storeId (storeId is
 // null for them) - matching them against effectiveStoreId as if it were a storeId always
 // fails and silently zeroes out the Production House tab/summary. Match each item by
 // whichever id its own entityType actually uses.
 const matchesEffectiveScope = (item: { storeId?: string | null; productionHouseId?: string | null; entityType?: 'store' | 'production_house' }) => {
 if (!effectiveStoreId) return true;
 if (item.entityType === 'production_house') {
 return !targetProductionHouseId || item.productionHouseId === targetProductionHouseId;
 }
 return item.storeId === effectiveStoreId;
 };

 console.log('🏪 InventoryManagement - effectiveStoreId:', effectiveStoreId);
 console.log('🏪 InventoryManagement - selectedStoreId prop:', selectedStoreId);
 console.log('🏪 InventoryManagement - user storeId:', context.user?.storeId);

 const filteredInventory = context.inventory.filter(
 (item) => {
 const dateMatch = item.date === selectedDate;
 return dateMatch && matchesEffectiveScope(item) && belongsToTab(item, activeTab);
 }
 );
 const filteredOverheads = context.overheads.filter(
 (item) => {
 const dateMatch = item.date === selectedDate;
 return dateMatch && matchesEffectiveScope(item) && belongsToTab(item, activeTab);
 }
 );
 const filteredFixedCosts = context.fixedCosts.filter(
 (item) => {
 const dateMatch = item.date === selectedDate;
 return dateMatch && matchesEffectiveScope(item) && belongsToTab(item, activeTab);
 }
 );

 const totalInventoryCost = filteredInventory.reduce(
 (sum, item) => sum + item.totalCost,
 0
 );
 const totalOverheadCost = filteredOverheads.reduce(
 (sum, item) => sum + item.amount,
 0
 );
 const totalFixedCost = filteredFixedCosts.reduce(
 (sum, item) => sum + item.amount,
 0
 );

 // Combined Store + Production House totals for the selected date, independent of
 // which single-entity tab is active - powers the "Total Purchases" summary tab.
 const combinedTotals = useMemo(() => {
 const forEntity = (entityType: 'store' | 'production_house') => {
 const inv = context.inventory.filter(item => {
 const dateMatch = item.date === selectedDate;
 return dateMatch && matchesEffectiveScope(item) && belongsToTab(item, entityType === 'production_house' ? 'production' : 'store');
 });
 const oh = context.overheads.filter(item => {
 const dateMatch = item.date === selectedDate;
 return dateMatch && matchesEffectiveScope(item) && belongsToTab(item, entityType === 'production_house' ? 'production' : 'store');
 });
 const fc = context.fixedCosts.filter(item => {
 const dateMatch = item.date === selectedDate;
 return dateMatch && matchesEffectiveScope(item) && belongsToTab(item, entityType === 'production_house' ? 'production' : 'store');
 });
 const inventoryCost = inv.reduce((sum, item) => sum + item.totalCost, 0);
 const overheadCost = oh.reduce((sum, item) => sum + item.amount, 0);
 const fixedCost = fc.reduce((sum, item) => sum + item.amount, 0);
 return {
 inventory: { total: inventoryCost, items: inv },
 overhead: { total: overheadCost, items: oh },
 fixedCost: { total: fixedCost, items: fc },
 total: inventoryCost + overheadCost + fixedCost,
 };
 };
 return { store: forEntity('store'), production: forEntity('production_house') };
 }, [context.inventory, context.overheads, context.fixedCosts, selectedDate, effectiveStoreId, targetProductionHouseId]);

 // Search results across ALL inventory (not date-filtered)
 const searchResults = useMemo(() => {
 if (!searchQuery.trim()) return [];
 const q = searchQuery.toLowerCase().trim();
 return context.inventory
 .filter(item => {
 const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
 const nameMatch = item.itemName.toLowerCase().includes(q);
 return storeMatch && nameMatch && belongsToTab(item, activeTab);
 })
 .sort((a, b) => b.date.localeCompare(a.date));
 }, [searchQuery, context.inventory, effectiveStoreId, activeTab]);

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

 return (
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
 {/* Page Header */}
 <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8">
 <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30 flex-shrink-0">
 <Package className="w-6 h-6 text-white" />
 </div>
 <div>
 <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Inventory Management</h1>
 <p className="text-sm sm:text-base text-gray-500">Track store and production house purchases</p>
 </div>
 </div>

 {/* Date Selector */}
 <DateSelector
 selectedDate={selectedDate}
 onDateChange={setSelectedDate}
 />

 {/* Store vs Production House vs Total - one segmented control instead of three
 loose pill buttons. Whichever entity this user defaults to leads. */}
 <div className="flex bg-gray-100 rounded-xl p-1 mt-6">
 {(defaultsToProduction
 ? (['production', 'store', 'combined'] as const)
 : (['store', 'production', 'combined'] as const)
 ).map((tab) => (
 <button
 key={tab}
 onClick={() => setActiveTab(tab)}
 className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
 activeTab === tab
 ? tab === 'combined'
 ? 'bg-purple-600 text-white shadow-sm'
 : tab === 'production'
 ? 'bg-green-600 text-white shadow-sm'
 : 'bg-blue-600 text-white shadow-sm'
 : 'text-gray-600 hover:text-gray-900'
 }`}
 >
 {tab === 'combined' ? 'Total Purchases' : tab === 'production' ? 'Production House' : 'Store'}
 </button>
 ))}
 </div>

 {activeTab === 'combined' ? (
 <div className="mt-6 space-y-6">
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
 {([
 { key: 'store' as const, label: 'Total Store Purchases', color: 'blue' },
 { key: 'production' as const, label: 'Total Production House Purchases', color: 'green' },
 ]).map(({ key, label, color }) => {
 const data = combinedTotals[key];
 return (
 <div key={key} className={`rounded-2xl p-6 border shadow-sm bg-gradient-to-br ${color === 'blue' ? 'from-blue-50 to-blue-100/50 border-blue-200' : 'from-green-50 to-green-100/50 border-green-200'}`}>
 <div className="flex items-center justify-between mb-4">
 <h3 className={`font-semibold ${color === 'blue' ? 'text-blue-800' : 'text-green-800'}`}>{label}</h3>
 <p className={`text-2xl font-bold ${color === 'blue' ? 'text-blue-900' : 'text-green-900'}`}>₹{data.total.toLocaleString()}</p>
 </div>
 <div className="space-y-2">
 <div className="flex items-center justify-between bg-white/70 rounded-lg px-4 py-2.5">
 <span className="text-sm text-gray-600">Inventory ({data.inventory.items.length} item{data.inventory.items.length === 1 ? '' : 's'})</span>
 <span className="font-semibold text-gray-900">₹{data.inventory.total.toLocaleString()}</span>
 </div>
 <div className="flex items-center justify-between bg-white/70 rounded-lg px-4 py-2.5">
 <span className="text-sm text-gray-600">Overhead ({data.overhead.items.length} item{data.overhead.items.length === 1 ? '' : 's'})</span>
 <span className="font-semibold text-gray-900">₹{data.overhead.total.toLocaleString()}</span>
 </div>
 <div className="flex items-center justify-between bg-white/70 rounded-lg px-4 py-2.5">
 <span className="text-sm text-gray-600">Fixed Cost ({data.fixedCost.items.length} item{data.fixedCost.items.length === 1 ? '' : 's'})</span>
 <span className="font-semibold text-gray-900">₹{data.fixedCost.total.toLocaleString()}</span>
 </div>
 </div>
 {(data.inventory.items.length > 0 || data.overhead.items.length > 0 || data.fixedCost.items.length > 0) && (
 <details className="mt-4">
 <summary className={`text-xs cursor-pointer hover:underline ${color === 'blue' ? 'text-blue-700' : 'text-green-700'}`}>
 ▸ View item details
 </summary>
 <div className="mt-3 space-y-3 text-sm">
 {data.inventory.items.length > 0 && (
 <div>
 <p className="font-medium text-gray-700 mb-1">Inventory</p>
 {data.inventory.items.map(item => (
 <div key={item.id} className="flex items-center justify-between text-gray-600 py-1">
 <span>{item.itemName} ({item.quantity} {item.unit})</span>
 <span>₹{item.totalCost.toLocaleString()}</span>
 </div>
 ))}
 </div>
 )}
 {data.overhead.items.length > 0 && (
 <div>
 <p className="font-medium text-gray-700 mb-1">Overhead</p>
 {data.overhead.items.map(item => (
 <div key={item.id} className="flex items-center justify-between text-gray-600 py-1">
 <span>{item.description || item.category}</span>
 <span>₹{item.amount.toLocaleString()}</span>
 </div>
 ))}
 </div>
 )}
 {data.fixedCost.items.length > 0 && (
 <div>
 <p className="font-medium text-gray-700 mb-1">Fixed Cost</p>
 {data.fixedCost.items.map(item => (
 <div key={item.id} className="flex items-center justify-between text-gray-600 py-1">
 <span>{item.category}</span>
 <span>₹{item.amount.toLocaleString()}</span>
 </div>
 ))}
 </div>
 )}
 </div>
 </details>
 )}
 </div>
 );
 })}
 </div>
 <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 shadow-lg shadow-purple-500/30 text-center">
 <p className="text-sm text-purple-100 uppercase tracking-wide">Combined Total ({formatDate(selectedDate)})</p>
 <p className="text-white text-3xl font-bold mt-2">₹{(combinedTotals.store.total + combinedTotals.production.total).toLocaleString()}</p>
 </div>
 </div>
 ) : (
 <>
 {/* Hero total - one number to glance at, with the inventory/overhead/fixed split
 tucked underneath instead of four equal-weight cards fighting for attention. */}
 <div className={`rounded-2xl p-6 mt-4 mb-6 shadow-sm bg-gradient-to-br ${activeTab === 'production' ? 'from-green-500 to-green-600' : 'from-blue-500 to-blue-600'}`}>
 <p className="text-xs text-white/80 uppercase tracking-wide">{activeTab === 'production' ? 'Production House' : 'Store'} spend · {formatDate(selectedDate)}</p>
 <p className="text-white text-3xl font-semibold mt-1">₹{(totalInventoryCost + totalOverheadCost + totalFixedCost).toLocaleString()}</p>
 <div className="grid grid-cols-3 gap-3 mt-4">
 <div className="bg-white/15 rounded-xl px-3 py-2">
 <p className="text-[11px] text-white/80 uppercase tracking-wide">Inventory</p>
 <p className="text-white text-sm font-semibold">₹{totalInventoryCost.toLocaleString()}</p>
 </div>
 <div className="bg-white/15 rounded-xl px-3 py-2">
 <p className="text-[11px] text-white/80 uppercase tracking-wide">Overhead</p>
 <p className="text-white text-sm font-semibold">₹{totalOverheadCost.toLocaleString()}</p>
 </div>
 <div className="bg-white/15 rounded-xl px-3 py-2">
 <p className="text-[11px] text-white/80 uppercase tracking-wide">Fixed</p>
 <p className="text-white text-sm font-semibold">₹{totalFixedCost.toLocaleString()}</p>
 </div>
 </div>
 </div>

 {/* Action Buttons */}
 <div className={`grid grid-cols-1 sm:grid-cols-2 ${context.user?.role === 'cluster_head' ? 'lg:grid-cols-3' : ''} gap-3 mb-6`}>
 <button
 onClick={() => setShowSearchModal(true)}
 className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium"
 >
 <Search className="w-4 h-4" />
 Search Items
 </button>
 <button
 onClick={() => setShowQuickAdd(true)}
 disabled={!canAddOnActiveTab}
 className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
 title={!canAddOnActiveTab ? `Only ${activeTab === 'production' ? 'the production incharge or operations manager' : 'the store incharge (own store only) or operations manager'} can add ${activeTab === 'production' ? 'production' : 'store'} expenses` : ''}
 >
 <Plus className="w-4 h-4" />
 Add Expense
 </button>
 {context.user?.role === 'cluster_head' && (
 <button
 onClick={() => setShowCategoryManager(true)}
 className="flex items-center justify-center gap-2 px-4 py-3 bg-stone-700 text-white rounded-lg hover:bg-stone-800 transition-colors font-medium"
 >
 <Settings className="w-4 h-4" />
 Manage Categories
 </button>
 )}
 </div>

 {/* Lists */}
 <InventoryList
 inventory={filteredInventory}
 overheads={filteredOverheads}
 fixedCosts={filteredFixedCosts}
 onEditInventory={(item) => {
 setEditingInventory(item);
 setShowInventoryForm(true);
 }}
 onDeleteInventory={context.deleteInventoryItem}
 onEditOverhead={(item) => {
 setEditingOverhead(item);
 setShowOverheadForm(true);
 }}
 onDeleteOverhead={context.deleteOverheadItem}
 onEditFixedCost={(item) => {
 setEditingFixedCost(item);
 setShowFixedCostForm(true);
 }}
 onDeleteFixedCost={context.deleteFixedCostItem}
 isManager={canAddOnActiveTab}
 />
 </>
 )}

 {/* Search Modal */}
 {showSearchModal && (
 <div className="fixed inset-0 bg-black/60 flex items-start justify-center p-4 z-50 overflow-y-auto">
 <div className="bg-white rounded-2xl max-w-3xl w-full my-8 shadow-2xl">
 {/* Header */}
 <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-200 p-6 z-10">
 <div className="flex items-center justify-between mb-4">
 <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
 <Search className="w-5 h-5 text-orange-600" />
 Search Inventory Items
 </h2>
 <button
 onClick={() => { setShowSearchModal(false); setSearchQuery(''); }}
 className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
 >
 ✕
 </button>
 </div>
 <input
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Type item name... e.g. Chicken, Ajinomoto, Oil"
 className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 placeholder-gray-400"
 autoFocus
 />
 </div>

 {/* Content */}
 <div className="p-6 max-h-[60vh] overflow-y-auto">
 {!searchQuery.trim() ? (
 <p className="text-center text-gray-400 py-12">Start typing to search across all dates...</p>
 ) : searchResults.length === 0 ? (
 <p className="text-center text-gray-500 py-12">No items found for "{searchQuery}"</p>
 ) : (
 <>
 {/* Summary Card */}
 {searchSummary && (
 <div className="bg-gradient-to-br from-orange-50 to-rose-50 border border-orange-200 rounded-xl p-5 mb-6">
 <h3 className="font-semibold text-orange-900 mb-3">📊 Summary for "{searchQuery}"</h3>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
 <div>
 <p className="text-gray-500">Occurrences</p>
 <p className="text-lg font-bold text-orange-700">{searchSummary.count}</p>
 </div>
 <div>
 <p className="text-gray-500">Total Spent</p>
 <p className="text-lg font-bold text-orange-700">₹{searchSummary.totalSpent.toLocaleString()}</p>
 </div>
 <div>
 <p className="text-gray-500">Rate Range</p>
 <p className="text-lg font-bold text-orange-700">
 ₹{Math.round(searchSummary.minRate)} - ₹{Math.round(searchSummary.maxRate)}
 </p>
 </div>
 <div>
 <p className="text-gray-500">Avg Rate</p>
 <p className="text-lg font-bold text-orange-700">₹{Math.round(searchSummary.avgRate)}</p>
 </div>
 </div>
 </div>
 )}

 {/* Results Table */}
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b border-gray-200 text-left text-gray-500">
 <th className="pb-3 font-medium">Date</th>
 <th className="pb-3 font-medium">Item</th>
 <th className="pb-3 font-medium">Category</th>
 <th className="pb-3 font-medium text-right">Qty</th>
 <th className="pb-3 font-medium text-right">Rate</th>
 <th className="pb-3 font-medium text-right">Total</th>
 <th className="pb-3 font-medium text-center">Payment</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-100">
 {searchResults.map((item) => (
 <tr key={item.id} className="hover:bg-gray-50 transition-colors">
 <td className="py-3 text-gray-600 whitespace-nowrap">{formatDate(item.date)}</td>
 <td className="py-3 font-medium text-gray-900">{item.itemName}</td>
 <td className="py-3 text-gray-500 text-xs">
 {INVENTORY_CATEGORIES[item.category as keyof typeof INVENTORY_CATEGORIES] || item.category}
 </td>
 <td className="py-3 text-right text-gray-700">{item.quantity} {item.unit}</td>
 <td className="py-3 text-right text-gray-700">₹{item.costPerUnit?.toLocaleString()}</td>
 <td className="py-3 text-right font-semibold text-blue-600">₹{item.totalCost.toLocaleString()}</td>
 <td className="py-3 text-center">
 {item.paymentMethod === 'cash' && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Cash</span>}
 {item.paymentMethod === 'online' && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">Online</span>}
 {item.paymentMethod === 'both' && <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">Split</span>}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </>
 )}
 </div>
 </div>
 </div>
 )}

 {/* Quick Add - the single smart entry point that replaces the old separate
 Inventory/Overhead/Fixed Cost "Add" buttons for new entries. Editing an existing
 item still goes through the type-specific forms below. */}
 {showQuickAdd && (
 <QuickAddExpense
 selectedDate={selectedDate}
 defaultEntity={activeTab === 'production' ? 'production_house' : 'store'}
 effectiveStoreId={effectiveStoreId}
 targetProductionHouseId={targetProductionHouseId}
 canCreateNewItems={context.user?.role === 'cluster_head'}
 onClose={() => setShowQuickAdd(false)}
 onSubmitInventory={async (item) => {
 await context.addInventoryItem(item);
 toast.success('Inventory item added!');
 }}
 onSubmitOverhead={async (item) => {
 await context.addOverheadItem(item);
 toast.success('Overhead cost added!');
 }}
 onSubmitFixedCost={async (item) => {
 await context.addFixedCostItem(item);
 toast.success('Fixed cost added!');
 }}
 />
 )}

 {/* Forms Modal */}
 {showInventoryForm && (
 <InventoryForm
 selectedDate={selectedDate}
 editingItem={editingInventory}
 entityType={activeTab === 'production' ? 'production_house' : 'store'}
 canCreateNewItems={context.user?.role === 'cluster_head'}
 onSubmit={async (item) => {
 try {
 const taggedItem = { ...item, ...getEntityFields() };
 if (editingInventory) {
 await context.updateInventoryItem(editingInventory.id, taggedItem);
 setShowInventoryForm(false);
 setEditingInventory(null);
 toast.success('Inventory item updated successfully!');
 } else {
 await context.addInventoryItem(taggedItem);
 // Don't close form for new items - let user add more
 toast.success('Inventory item added! You can add another item.');
 }
 } catch (error) {
 toast.error('Failed to save inventory item. Please try again.');
 }
 }}
 onClose={() => {
 setShowInventoryForm(false);
 setEditingInventory(null);
 }}
 />
 )}

 {showOverheadForm && (
 <OverheadForm
 selectedDate={selectedDate}
 editingItem={editingOverhead}
 employees={employees}
 existingOverheads={context.overheads}
 entityScope={activeTab === 'production' ? 'production' : 'store'}
 onSubmit={async (item) => {
 try {
 const taggedItem = { ...item, ...getEntityFields() };
 if (editingOverhead) {
 await context.updateOverheadItem(editingOverhead.id, taggedItem);
 } else {
 await context.addOverheadItem(taggedItem);
 }
 setShowOverheadForm(false);
 setEditingOverhead(null);
 toast.success('Expense/Overhead cost saved successfully!');
 } catch (error) {
 console.error('❌ Error saving expense/overhead:', error);
 const errorMessage = error instanceof Error ? error.message : 'Failed to save expense/overhead cost. Please try again.';
 toast.error(errorMessage);
 }
 }}
 onClose={() => {
 setShowOverheadForm(false);
 setEditingOverhead(null);
 }}
 />
 )}

 {showFixedCostForm && (
 <FixedCostForm
 selectedDate={selectedDate}
 editingItem={editingFixedCost}
 onSubmit={async (item) => {
 try {
 const taggedItem = { ...item, ...getEntityFields() };
 if (editingFixedCost) {
 await context.updateFixedCostItem(editingFixedCost.id, taggedItem);
 } else {
 await context.addFixedCostItem(taggedItem);
 }
 setShowFixedCostForm(false);
 setEditingFixedCost(null);
 toast.success('Fixed cost saved successfully!');
 } catch (error) {
 alert('Failed to save fixed cost. Please try again.');
 }
 }}
 onClose={() => {
 setShowFixedCostForm(false);
 setEditingFixedCost(null);
 }}
 />
 )}

 {showCategoryManager && (
 <CategoryManagerModal onClose={() => setShowCategoryManager(false)} />
 )}
 </div>
 );
}