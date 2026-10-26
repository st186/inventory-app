import { useState } from 'react';
import { InventoryContextType, InventoryItem, OverheadItem, FixedCostItem } from '../App';
import { DateSelector } from './DateSelector';
import { Package, DollarSign, TrendingUp, Lock, Eye, Calendar, AlertTriangle, Search, X, ArrowUp, ArrowDown, Minus, Building2, Store as StoreIcon, Layers } from 'lucide-react';
import { MonthlyStockRecalibration } from './MonthlyStockRecalibration';
import { UtilitiesStockStatus } from './UtilitiesStockStatus';
import { CategoryManagerModal } from './CategoryManagerModal';
import { getTodayIST } from '../utils/timezone';

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
};

function StatChip({ label, value, color = 'blue' }: { label: string; value: number; color?: 'blue' | 'amber' | 'purple' | 'rose' }) {
  return (
    <div className={`rounded-2xl p-4 text-white shadow-lg bg-gradient-to-br ${
      color === 'blue' ? 'from-blue-500 to-blue-600 shadow-blue-500/20'
      : color === 'amber' ? 'from-amber-500 to-amber-600 shadow-amber-500/20'
      : color === 'purple' ? 'from-purple-500 to-purple-600 shadow-purple-500/20'
      : 'from-rose-500 to-rose-600 shadow-rose-500/20'
    }`}>
      <p className="text-xs uppercase tracking-wide text-white/80">{label}</p>
      <p className="text-xl font-semibold mt-1">₹{value.toLocaleString()}</p>
    </div>
  );
}

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-primary flex-shrink-0">
          {icon}
        </div>
        <h2 className="text-foreground font-bold tracking-tight">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="text-center py-10 text-muted-foreground">
      <div className="mx-auto mb-3 opacity-50 w-fit">{icon}</div>
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function InventoryView({ context, selectedStoreId }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(
    getTodayIST()
  );
  const [showRecalibration, setShowRecalibration] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  // Store vs Production House vs Combined - production-house-tagged records carry a
  // productionHouseId, not a storeId, so the store selector (which only lists retail
  // stores) can never surface them and a plain storeId match always excludes them.
  // Mirrors the same tab split already used in InventoryManagement.tsx (the editable
  // operations-manager view) so the cluster head's read-only view can see both.
  const [activeTab, setActiveTab] = useState<'store' | 'production' | 'combined' | 'utilities'>('store');
  const [searchQuery, setSearchQuery] = useState('');

  const categoryLabels: Record<string, string> = {
    fresh_produce: 'Fresh Vegetables',
    spices_seasonings: 'Grocery',
    dairy: 'Dairy Products',
    meat: 'Meat',
    packaging: 'Packaging Materials',
    fuel: 'Fuel',
    travel: 'Travel',
    transportation: 'Transportation',
    marketing: 'Marketing',
    service_charge: 'Service Charge',
    repair: 'Repair & Maintenance',
    party: 'Party Expenses',
    lunch: 'Lunch',
    miscellaneous: 'Miscellaneous',
    electricity: 'Electricity',
    rent: 'Rent'
  };

  // Filter data based on selected date and selected store (fallback to user's store)
  const effectiveStoreId = selectedStoreId || context.user?.storeId;
  // This business currently has a single production house - same assumption
  // InventoryManagement.tsx makes when tagging/matching production-tab entries.
  const targetProductionHouseId = context.productionHouses?.[0]?.id;

  const belongsToTab = (item: { entityType?: 'store' | 'production_house' }, tab: 'store' | 'production' | 'combined' | 'utilities') =>
    tab === 'production' ? item.entityType === 'production_house' : tab === 'store' ? item.entityType !== 'production_house' : true;

  const matchesEffectiveScope = (item: { storeId?: string | null; productionHouseId?: string | null; entityType?: 'store' | 'production_house' }) => {
    if (item.entityType === 'production_house') {
      return !targetProductionHouseId || item.productionHouseId === targetProductionHouseId;
    }
    return !effectiveStoreId || item.storeId === effectiveStoreId;
  };

  const filteredInventory = context.inventory.filter(
    (item) => item.date === selectedDate && matchesEffectiveScope(item) && belongsToTab(item, activeTab)
  );

  const filteredOverheads = context.overheads.filter(
    (item) => item.date === selectedDate && matchesEffectiveScope(item) && belongsToTab(item, activeTab)
  );

  const filteredFixedCosts = context.fixedCosts.filter(
    (item) => item.date === selectedDate && matchesEffectiveScope(item) && belongsToTab(item, activeTab)
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

  // Search is global - it looks across every date (scoped only by store/production-house
  // and the active tab, same as everything else on this page), not just whatever day
  // happens to be selected above. The Summary Cards stat chips still reflect just the
  // selected day; the search results below are their own independent, date-spanning view,
  // sorted most-recent-first so the latest purchase of a searched item shows up top.
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  const matchesQuery = (text: string | null | undefined) => !query || (text || '').toLowerCase().includes(query);
  const byDateDesc = (a: { date: string }, b: { date: string }) => b.date.localeCompare(a.date);

  const scopedInventory = context.inventory.filter((item) => matchesEffectiveScope(item) && belongsToTab(item, activeTab));
  const scopedOverheads = context.overheads.filter((item) => matchesEffectiveScope(item) && belongsToTab(item, activeTab));
  const scopedFixedCosts = context.fixedCosts.filter((item) => matchesEffectiveScope(item) && belongsToTab(item, activeTab));

  const searchedInventory = (isSearching ? scopedInventory : filteredInventory)
    .filter((item) => matchesQuery(item.itemName))
    .sort(isSearching ? byDateDesc : () => 0);
  const searchedOverheads = (isSearching ? scopedOverheads : filteredOverheads)
    .filter((item) => matchesQuery(item.description) || matchesQuery(categoryLabels[item.category] || item.category))
    .sort(isSearching ? byDateDesc : () => 0);
  const searchedFixedCosts = (isSearching ? scopedFixedCosts : filteredFixedCosts)
    .filter((item) => matchesQuery(item.description) || matchesQuery(categoryLabels[item.category] || item.category))
    .sort(isSearching ? byDateDesc : () => 0);

  // Group inventory by category
  const inventoryByCategory = searchedInventory.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  // Group overheads by category
  const overheadsByCategory = searchedOverheads.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, OverheadItem[]>);

  const isClusterHead = context.user?.role === 'cluster_head';

  // ---- Month-to-date expense overview: production house vs store vs combined, each
  // compared against the same day-range last month (Day 1-N, matching the "vs Last
  // Month" comparison convention already used in the Stock Requests by Momo Type cards).
  // Independent of activeTab/search - this always covers both sides at once, since the
  // whole point is to compare them against each other. ----
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const selDateObj = new Date(selectedDate + 'T00:00:00');
  const mtdStart = `${selDateObj.getFullYear()}-${pad2(selDateObj.getMonth() + 1)}-01`;
  const dayOfMonth = selDateObj.getDate();

  const prevMonthDate = new Date(selDateObj.getFullYear(), selDateObj.getMonth() - 1, 1);
  const daysInPrevMonth = new Date(selDateObj.getFullYear(), selDateObj.getMonth(), 0).getDate();
  const prevMonthCappedDay = Math.min(dayOfMonth, daysInPrevMonth);
  const prevMtdStart = `${prevMonthDate.getFullYear()}-${pad2(prevMonthDate.getMonth() + 1)}-01`;
  const prevMtdEnd = `${prevMonthDate.getFullYear()}-${pad2(prevMonthDate.getMonth() + 1)}-${pad2(prevMonthCappedDay)}`;

  const sumExpensesInRange = (records: { date: string; entityType?: 'store' | 'production_house'; storeId?: string | null; productionHouseId?: string | null; amount?: number; totalCost?: number }[], start: string, end: string, isProduction: boolean) =>
    records
      .filter((r) => r.date >= start && r.date <= end)
      .filter((r) => (r.entityType === 'production_house') === isProduction)
      .filter((r) => isProduction
        ? (!targetProductionHouseId || r.productionHouseId === targetProductionHouseId)
        : (!effectiveStoreId || r.storeId === effectiveStoreId))
      .reduce((sum, r) => sum + (r.totalCost ?? r.amount ?? 0), 0);

  const mtdFor = (start: string, end: string, isProduction: boolean) =>
    sumExpensesInRange(context.inventory, start, end, isProduction) +
    sumExpensesInRange(context.overheads, start, end, isProduction) +
    sumExpensesInRange(context.fixedCosts, start, end, isProduction);

  const productionMTD = mtdFor(mtdStart, selectedDate, true);
  const storeMTD = mtdFor(mtdStart, selectedDate, false);
  const combinedMTD = productionMTD + storeMTD;

  const productionPrevMTD = mtdFor(prevMtdStart, prevMtdEnd, true);
  const storePrevMTD = mtdFor(prevMtdStart, prevMtdEnd, false);
  const combinedPrevMTD = productionPrevMTD + storePrevMTD;

  const pctChange = (curr: number, prev: number) => (prev > 0 ? ((curr - prev) / prev) * 100 : (curr > 0 ? 100 : 0));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header with Read-Only Badge */}
      <div className="mb-4 sm:mb-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30 flex-shrink-0">
            <Eye className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Inventory overview</h1>
            <p className="text-sm sm:text-base text-gray-500">Read-only view of purchases and costs</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-full flex-shrink-0">
          <Lock className="w-3.5 h-3.5 text-amber-700" />
          <span className="text-xs text-amber-800">View only</span>
        </div>
      </div>

      {/* Date Selector */}
      <DateSelector
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
      />

      {/* Store vs Production House vs Combined - production house data can't be reached
          via the store selector above (it only lists retail stores), so this tab is the
          only way to view its inventory/overhead costs. */}
      <div className="flex bg-gray-100 rounded-xl p-1 mt-4">
        {(['store', 'production', 'combined', 'utilities'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? tab === 'combined'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : tab === 'production'
                  ? 'bg-green-600 text-white shadow-sm'
                  : tab === 'utilities'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab === 'combined' ? 'Combined' : tab === 'production' ? 'Production House' : tab === 'utilities' ? 'Utilities' : 'Store'}
          </button>
        ))}
      </div>

      {activeTab === 'utilities' ? (
        <div className="mt-6">
          <UtilitiesStockStatus context={context} stores={context.stores} />
        </div>
      ) : (
      <>
      {/* Month-to-Date Expense Overview - production house vs store vs combined, each
          against the same day-range last month. Independent of the Store/Production/
          Combined tab above, since the whole point is to see both sides at once. */}
      <div className="bg-card rounded-2xl border border-border p-5 mt-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-primary flex-shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-foreground font-bold tracking-tight">Month-to-date expenses</h2>
            <p className="text-xs text-muted-foreground">1st to {selDateObj.getDate()} {selDateObj.toLocaleDateString('en-IN', { month: 'short' })} &middot; vs same days last month</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            { label: 'Production House', icon: <Building2 className="w-4 h-4" />, value: productionMTD, prev: productionPrevMTD, accent: 'text-emerald-600' },
            { label: 'Store', icon: <StoreIcon className="w-4 h-4" />, value: storeMTD, prev: storePrevMTD, accent: 'text-blue-600' },
            { label: 'Combined', icon: <Layers className="w-4 h-4" />, value: combinedMTD, prev: combinedPrevMTD, accent: 'text-purple-600' },
          ] as const).map(({ label, icon, value, prev, accent }) => {
            const change = pctChange(value, prev);
            const direction: 'up' | 'down' | 'same' = change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'same';
            return (
              <div key={label} className="rounded-xl border border-border bg-background p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <span className={accent}>{icon}</span>
                  <span className="text-xs text-muted-foreground font-medium">{label}</span>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <p className="text-xl font-bold text-foreground tabular-nums">₹{value.toLocaleString()}</p>
                  {prev > 0 && (
                    <span className={`flex items-center gap-0.5 text-xs font-semibold flex-shrink-0 ${
                      direction === 'up' ? 'text-red-600' : direction === 'down' ? 'text-emerald-600' : 'text-gray-400'
                    }`}>
                      {direction === 'up' && <ArrowUp className="w-3 h-3" />}
                      {direction === 'down' && <ArrowDown className="w-3 h-3" />}
                      {direction === 'same' && <Minus className="w-3 h-3" />}
                      {Math.abs(change).toFixed(0)}%
                    </span>
                  )}
                </div>
                {prev > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">vs ₹{prev.toLocaleString()} last month</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="relative mt-6">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for an item..."
          className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-secondary"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Summary Cards - always reflect the selected day only, even while a global search
          is active below, so these figures never look like they've silently changed. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 mb-4">
        <StatChip label="Inventory cost" value={totalInventoryCost} color="blue" />
        <StatChip label="Overhead cost" value={totalOverheadCost} color="amber" />
        <StatChip label="Fixed cost" value={totalFixedCost} color="purple" />
        <StatChip label="Total expenses" value={totalInventoryCost + totalOverheadCost + totalFixedCost} color="rose" />
      </div>

      {isSearching && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-secondary text-xs text-muted-foreground">
          <Search className="w-3.5 h-3.5 flex-shrink-0" />
          Showing "{searchQuery.trim()}" across all dates, not just {selectedDate}
        </div>
      )}

      {/* Inventory Items by Category */}
      <SectionCard icon={<Package className="w-4 h-4" />} title="Inventory items">
        {Object.keys(inventoryByCategory).length > 0 ? (
          <div className="space-y-5">
            {Object.entries(inventoryByCategory).map(([category, items]) => {
              const categoryTotal = items.reduce((sum, item) => sum + (item.totalCost || 0), 0);
              return (
              <div key={category}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-xs text-muted-foreground uppercase tracking-wide">{categoryLabels[category] || category}</h3>
                  <span className="text-xs font-semibold text-foreground">₹{categoryTotal.toLocaleString()}</span>
                </div>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border bg-background p-3 flex items-center gap-3"
                    >
                      <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 text-lg">
                        📦
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">
                          {item.itemName || (
                            <span className="text-red-600 italic inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Missing name
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isSearching && <span className="text-foreground/70">{item.date} · </span>}
                          {item.quantity} {item.unit} · ₹{(item.costPerUnit || 0).toFixed(2)}/{item.unit}
                        </p>
                      </div>
                      <span className="text-sm text-primary flex-shrink-0">₹{(item.totalCost || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<Package className="w-10 h-10" />} label={isSearching ? 'No inventory items match this search' : 'No inventory items for this date'} />
        )}
      </SectionCard>

      {/* Overhead Costs by Category */}
      <SectionCard icon={<DollarSign className="w-4 h-4" />} title="Overhead costs">
        {Object.keys(overheadsByCategory).length > 0 ? (
          <div className="space-y-5">
            {Object.entries(overheadsByCategory).map(([category, items]) => {
              const categoryTotal = items.reduce((sum, item) => sum + (item.amount || 0), 0);
              return (
              <div key={category}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-xs text-muted-foreground uppercase tracking-wide">{categoryLabels[category] || category}</h3>
                  <span className="text-xs font-semibold text-foreground">₹{categoryTotal.toLocaleString()}</span>
                </div>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border bg-background p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate">{item.description}</p>
                        {isSearching && <p className="text-xs text-muted-foreground mt-0.5">{item.date}</p>}
                      </div>
                      <span className="text-sm text-primary flex-shrink-0">₹{item.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<DollarSign className="w-10 h-10" />} label={isSearching ? 'No overhead costs match this search' : 'No overhead costs for this date'} />
        )}
      </SectionCard>

      {/* Fixed Costs */}
      {searchedFixedCosts.length > 0 && (
        <SectionCard icon={<TrendingUp className="w-4 h-4" />} title="Fixed costs">
          <div className="space-y-2">
            {searchedFixedCosts.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-background p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{categoryLabels[item.category] || item.category}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.description}{isSearching && ` · ${item.date}`}</p>
                </div>
                <span className="text-sm text-primary flex-shrink-0">₹{item.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Monthly Stock Recalibration Button */}
      {isClusterHead && (
        <div className="mt-2 mb-4 flex flex-wrap gap-2">
          <button
            className="flex items-center gap-2 bg-primary hover:opacity-90 text-primary-foreground py-2.5 px-4 rounded-xl text-sm transition-opacity"
            onClick={() => setShowRecalibration(true)}
          >
            <Calendar className="w-4 h-4" />
            Monthly stock recalibration
          </button>
          <button
            className="flex items-center gap-2 bg-stone-700 hover:bg-stone-800 text-white py-2.5 px-4 rounded-xl text-sm transition-colors"
            onClick={() => setShowCategoryManager(true)}
          >
            <Package className="w-4 h-4" />
            Manage Categories
          </button>
        </div>
      )}

      {/* Monthly Stock Recalibration Modal */}
      {showRecalibration && (
        <MonthlyStockRecalibration
          context={context}
          selectedStoreId={effectiveStoreId}
          onClose={() => setShowRecalibration(false)}
        />
      )}

      {showCategoryManager && (
        <CategoryManagerModal onClose={() => setShowCategoryManager(false)} />
      )}
      </>
      )}

      {/* Info Message */}
      <div className="mt-4 bg-secondary rounded-2xl p-4">
        <div className="flex gap-3">
          <Lock className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">
            {isClusterHead
              ? "You're viewing inventory data in read-only mode. Only operations managers can add or edit inventory items."
              : "You're viewing inventory data in read-only mode. To add or modify inventory items, contact your operations manager."
            }
          </p>
        </div>
      </div>
    </div>
  );
}
