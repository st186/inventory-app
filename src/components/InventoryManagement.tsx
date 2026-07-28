import { useState, useMemo, useEffect } from 'react';
import { InventoryContextType, InventoryItem, OverheadItem, FixedCostItem } from '../App';
import { Employee } from '../utils/api';
import { InventoryForm } from './InventoryForm';
import { OverheadForm } from './OverheadForm';
import { FixedCostForm } from './FixedCostForm';
import { InventoryList } from './InventoryList';
import { DateSelector } from './DateSelector';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { getTodayIST, formatDateIST } from '../utils/timezone';
import { INVENTORY_CATEGORIES } from '../utils/inventoryData';

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
 const [editingInventory, setEditingInventory] = useState<InventoryItem | null>(null);
 const [editingOverhead, setEditingOverhead] = useState<OverheadItem | null>(null);
 const [editingFixedCost, setEditingFixedCost] = useState<FixedCostItem | null>(null);
 const [showSearchModal, setShowSearchModal] = useState(false);
 const [searchQuery, setSearchQuery] = useState('');

 const isProductionIncharge = context.user?.designation === 'production_incharge';
 const isStoreIncharge = context.user?.designation === 'store_incharge';
 // Operations manager: any other manager (not tied to a single store or production house).
 const isOperationsManager = context.user?.role === 'manager' && !isStoreIncharge && !isProductionIncharge;
 const [activeTab, setActiveTab] = useState<'store' | 'production'>(
 isProductionIncharge ? 'production' : 'store'
 );
 // Items saved before this split lack entityType — treat those as store expenses.
 const belongsToTab = (item: { entityType?: 'store' | 'production_house' }, tab: 'store' | 'production') =>
 tab === 'production' ? item.entityType === 'production_house' : item.entityType !== 'production_house';

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
 const canAddOnActiveTab = activeTab === 'production'
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

 console.log('🏪 InventoryManagement - effectiveStoreId:', effectiveStoreId);
 console.log('🏪 InventoryManagement - selectedStoreId prop:', selectedStoreId);
 console.log('🏪 InventoryManagement - user storeId:', context.user?.storeId);

 const filteredInventory = context.inventory.filter(
 (item) => {
 const dateMatch = item.date === selectedDate;
 const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
 return dateMatch && storeMatch && belongsToTab(item, activeTab);
 }
 );
 const filteredOverheads = context.overheads.filter(
 (item) => {
 const dateMatch = item.date === selectedDate;
 const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
 return dateMatch && storeMatch && belongsToTab(item, activeTab);
 }
 );
 const filteredFixedCosts = context.fixedCosts.filter(
 (item) => {
 const dateMatch = item.date === selectedDate;
 const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
 return dateMatch && storeMatch && belongsToTab(item, activeTab);
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
 {/* Date Selector */}
 <DateSelector
 selectedDate={selectedDate}
 onDateChange={setSelectedDate}
 />

 {/* Store vs Production House tabs */}
 <div className="flex gap-2 mt-6">
 <button
 onClick={() => setActiveTab('store')}
 className={`px-5 py-2.5 rounded-lg font-medium transition-colors ${
 activeTab === 'store'
 ? 'bg-blue-600 text-white shadow-md'
 : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
 }`}
 >
 Store Expense
 </button>
 <button
 onClick={() => setActiveTab('production')}
 className={`px-5 py-2.5 rounded-lg font-medium transition-colors ${
 activeTab === 'production'
 ? 'bg-green-600 text-white shadow-md'
 : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
 }`}
 >
 Production Expense
 </button>
 </div>

 {/* Summary Cards */}
 <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 mb-6">
 <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 shadow-lg shadow-blue-500/30">
 <p className="text-sm text-blue-100 uppercase tracking-wide">Inventory Cost</p>
 <p className="text-white text-2xl mt-2">₹{totalInventoryCost.toLocaleString()}</p>
 </div>
 <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 shadow-lg shadow-orange-500/30">
 <p className="text-sm text-orange-100 uppercase tracking-wide">Overhead Cost</p>
 <p className="text-white text-2xl mt-2">₹{totalOverheadCost.toLocaleString()}</p>
 </div>
 <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 shadow-lg shadow-green-500/30">
 <p className="text-sm text-green-100 uppercase tracking-wide">Fixed Cost</p>
 <p className="text-white text-2xl mt-2">₹{totalFixedCost.toLocaleString()}</p>
 </div>
 <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 shadow-lg shadow-orange-500/30">
 <p className="text-sm text-orange-100 uppercase tracking-wide">Total Expenses</p>
 <p className="text-white text-2xl mt-2">
 ₹{(totalInventoryCost + totalOverheadCost + totalFixedCost).toLocaleString()}
 </p>
 </div>
 </div>

 {/* Action Buttons */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
 <button
 onClick={() => setShowSearchModal(true)}
 className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium"
 >
 <Search className="w-4 h-4" />
 Search Items
 </button>
 <button
 onClick={() => setShowInventoryForm(true)}
 disabled={!canAddOnActiveTab}
 className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
 title={!canAddOnActiveTab ? `Only ${activeTab === 'production' ? 'the production incharge or operations manager' : 'the store incharge (own store only) or operations manager'} can add ${activeTab === 'production' ? 'production' : 'store'} inventory items` : ''}
 >
 <Plus className="w-4 h-4" />
 Add Inventory Item
 </button>
 <button
 onClick={() => setShowOverheadForm(true)}
 disabled={!canAddOnActiveTab}
 className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
 title={!canAddOnActiveTab ? `Only ${activeTab === 'production' ? 'the production incharge or operations manager' : 'the store incharge (own store only) or operations manager'} can add ${activeTab === 'production' ? 'production' : 'store'} overhead costs` : ''}
 >
 <Plus className="w-4 h-4" />
 Add Overhead
 </button>
 <button
 onClick={() => setShowFixedCostForm(true)}
 disabled={!canAddOnActiveTab}
 className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
 title={!canAddOnActiveTab ? `Only ${activeTab === 'production' ? 'the production incharge or operations manager' : 'the store incharge (own store only) or operations manager'} can add ${activeTab === 'production' ? 'production' : 'store'} fixed costs` : ''}
 >
 <Plus className="w-4 h-4" />
 Add Fixed Cost
 </button>
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

 {/* Forms Modal */}
 {showInventoryForm && (
 <InventoryForm
 selectedDate={selectedDate}
 editingItem={editingInventory}
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
 </div>
 );
}