// Expenses for the auditor (Audit > Expenses) and the owner's read-only view: one day's
// purchases, running and fixed costs for the store, the production house or both, the month so
// far against the same days last month, and a search across every date. Read-only.
import { useState } from 'react';
import { InventoryContextType, InventoryItem, OverheadItem } from '../App';
import { Package, Receipt, TrendingUp, Lock, Calendar, AlertTriangle, Search, X, Tags, Boxes } from 'lucide-react';
import { MonthlyStockRecalibration } from './MonthlyStockRecalibration';
import { UtilitiesStockStatus } from './UtilitiesStockStatus';
import { CategoryManagerModal } from './CategoryManagerModal';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { DateStrip } from './ui/date-strip';
import { EmptyState } from './ui/empty-state';
import { IconButton } from './ui/icon-button';
import { Input } from './ui/input';
import { ListGroup, ListRow } from './ui/list-row';
import { formatINR } from './ui/money';
import { SegmentedControl } from './ui/segmented-control';
import { StatGrid, StatTile } from './ui/stat-tile';
import { SectionHeading } from './insights/parts/common';
import { getTodayIST } from '../utils/timezone';

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
};

type Tab = 'store' | 'production' | 'combined';
const TABS: { value: Tab; label: string }[] = [
  { value: 'store', label: 'Store' },
  { value: 'production', label: 'Production' },
  { value: 'combined', label: 'Both' },
];

const rupees = (n: number) => formatINR(Math.round(n * 100) / 100);

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
  const [activeTab, setActiveTab] = useState<Tab>('store');
  const [showUtilities, setShowUtilities] = useState(false);
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

  const belongsToTab = (item: { entityType?: 'store' | 'production_house' }, tab: Tab) =>
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

  const today = getTodayIST();
  const rangeLabel = `1–${dayOfMonth} ${selDateObj.toLocaleDateString('en-IN', { month: 'short' })}`;
  const mtdTile = (label: string, value: number, prev: number, hero = false) => {
    const change = pctChange(value, prev);
    return (
      <StatTile
        hero={hero}
        label={label}
        tint="peach"
        value={rupees(value)}
        delta={prev > 0 ? { value: change, label: 'vs last month', goodWhen: 'down', text: `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change).toFixed(0)}%` } : undefined}
        caption={prev > 0 ? `Last month ${rupees(prev)}` : 'Nothing last month'}
      />
    );
  };
  const categoryMeta = (n: number) => (n === 1 ? '1 entry' : `${n} entries`);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-surface px-2 pt-1 pb-2">
        <DateStrip
          value={selectedDate}
          onChange={setSelectedDate}
          today={today}
          max={today}
          showMonthLabel
          headerAction={selectedDate !== today ? <Button variant="ghost" size="sm" onClick={() => setSelectedDate(today)}>Today</Button> : undefined}
        />
      </div>

      {/* Production house records carry a productionHouseId, not a storeId, so the store
          picker can't reach them: this switch is the only way to see their costs. */}
      <SegmentedControl aria-label="Whose costs" value={activeTab} onValueChange={setActiveTab} options={TABS} />

      {/* The month so far, both sides at once whatever the switch above says. */}
      <section className="flex flex-col gap-3" aria-labelledby="mtd-title">
        <SectionHeading id="mtd-title" as="h3" title="Month to date" caption={`${rangeLabel} against the same days last month`} />
        {mtdTile('Store and production', combinedMTD, combinedPrevMTD, true)}
        <StatGrid>
          {mtdTile('Production house', productionMTD, productionPrevMTD)}
          {mtdTile('Store', storeMTD, storePrevMTD)}
        </StatGrid>
      </section>

      {/* The selected day only, even while a search is showing every date below. */}
      <section className="flex flex-col gap-3" aria-labelledby="day-title">
        <SectionHeading id="day-title" as="h3" title={selDateObj.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} />
        <StatGrid columns={4}>
          <StatTile label="Purchases" tint="peach" value={rupees(totalInventoryCost)} />
          <StatTile label="Running costs" tint="peach" value={rupees(totalOverheadCost)} />
          <StatTile label="Fixed costs" tint="peach" value={rupees(totalFixedCost)} />
          <StatTile label="Total spent" tint="peach" value={rupees(totalInventoryCost + totalOverheadCost + totalFixedCost)} />
        </StatGrid>
      </section>

      <div className="flex flex-col gap-2">
        <Input
          leading={<Search className="size-4 text-text-3" aria-hidden="true" />}
          trailing={searchQuery ? <IconButton icon={<X />} label="Clear search" variant="ghost" onClick={() => setSearchQuery('')} /> : undefined}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search an item across all dates"
          aria-label="Search an item"
        />
        {isSearching && <p className="text-label text-text-3">Showing "{searchQuery.trim()}" on every date, newest first.</p>}
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="purchases-title">
        <SectionHeading id="purchases-title" as="h3" title="Purchases" />
        {Object.keys(inventoryByCategory).length === 0 ? (
          <div className="rounded-lg border border-border bg-surface">
            <EmptyState compact icon={Package} title={isSearching ? 'No purchases match this search' : 'No purchases on this day'} />
          </div>
        ) : (
          Object.entries(inventoryByCategory).map(([category, items]: [string, InventoryItem[]]) => (
            <ListGroup
              key={category}
              title={categoryLabels[category] || category}
              meta={categoryMeta(items.length)}
              action={<span className="num text-body-sm font-semibold text-text">{rupees(items.reduce((sum, item) => sum + (item.totalCost || 0), 0))}</span>}
            >
              {items.map((item) => (
                <ListRow
                  key={item.id}
                  icon={item.itemName ? Package : AlertTriangle}
                  iconTone={item.itemName ? undefined : 'danger'}
                  title={item.itemName || 'Missing name'}
                  subtitle={[isSearching ? item.date : '', `${item.quantity} ${item.unit} · ${rupees(item.costPerUnit || 0)}/${item.unit}`].filter(Boolean).join(' · ')}
                  trailing={<span className="num text-body-md font-semibold text-text">{rupees(item.totalCost || 0)}</span>}
                />
              ))}
            </ListGroup>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="running-title">
        <SectionHeading id="running-title" as="h3" title="Running costs" />
        {Object.keys(overheadsByCategory).length === 0 ? (
          <div className="rounded-lg border border-border bg-surface">
            <EmptyState compact icon={Receipt} title={isSearching ? 'No running costs match this search' : 'No running costs on this day'} />
          </div>
        ) : (
          Object.entries(overheadsByCategory).map(([category, items]: [string, OverheadItem[]]) => (
            <ListGroup
              key={category}
              title={categoryLabels[category] || category}
              meta={categoryMeta(items.length)}
              action={<span className="num text-body-sm font-semibold text-text">{rupees(items.reduce((sum, item) => sum + (item.amount || 0), 0))}</span>}
            >
              {items.map((item) => (
                <ListRow
                  key={item.id}
                  icon={Receipt}
                  title={item.description}
                  subtitle={isSearching ? item.date : undefined}
                  trailing={<span className="num text-body-md font-semibold text-text">{rupees(item.amount)}</span>}
                />
              ))}
            </ListGroup>
          ))
        )}
      </section>

      {searchedFixedCosts.length > 0 && (
        <ListGroup title="Fixed costs">
          {searchedFixedCosts.map((item) => (
            <ListRow
              key={item.id}
              icon={TrendingUp}
              title={categoryLabels[item.category] || item.category}
              subtitle={[item.description, isSearching ? item.date : ''].filter(Boolean).join(' · ')}
              trailing={<span className="num text-body-md font-semibold text-text">{rupees(item.amount)}</span>}
            />
          ))}
        </ListGroup>
      )}

      {isClusterHead && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" leadingIcon={<Calendar />} onClick={() => setShowRecalibration(true)}>Monthly stock recalibration</Button>
          <Button variant="secondary" leadingIcon={<Tags />} onClick={() => setShowCategoryManager(true)}>Manage categories</Button>
        </div>
      )}

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

      <div className="flex flex-col gap-3">
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <ListRow
            icon={Boxes}
            title="Utilities stock"
            subtitle="Boxes, trays and drinks left at each store, from POS orders"
            chevron={showUtilities ? 'down' : true}
            aria-expanded={showUtilities}
            onClick={() => setShowUtilities((v) => !v)}
          />
        </div>
        {showUtilities && <UtilitiesStockStatus context={context} stores={context.stores} />}
      </div>

      <Callout tone="neutral" icon={Lock}>
        {isClusterHead
          ? 'Read-only here. Operations managers add and edit these entries.'
          : 'Read-only. To add or change an entry, ask the operations manager.'}
      </Callout>
    </div>
  );
}
