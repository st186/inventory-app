import { useState } from 'react';
import { InventoryContextType, InventoryItem, OverheadItem, FixedCostItem } from '../App';
import { DateSelector } from './DateSelector';
import { Package, DollarSign, TrendingUp, Lock, Eye, Calendar, AlertTriangle } from 'lucide-react';
import { MonthlyStockRecalibration } from './MonthlyStockRecalibration';

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
};

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-secondary rounded-2xl p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-foreground text-xl mt-1">₹{value.toLocaleString()}</p>
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
        <h2 className="text-foreground">{title}</h2>
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
    new Date().toISOString().split('T')[0]
  );
  const [showRecalibration, setShowRecalibration] = useState(false);

  // Filter data based on selected date and selected store (fallback to user's store)
  const effectiveStoreId = selectedStoreId || context.user?.storeId;

  const filteredInventory = context.inventory.filter(
    (item) => {
      const dateMatch = item.date === selectedDate;
      const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
      return dateMatch && storeMatch;
    }
  );

  const filteredOverheads = context.overheads.filter(
    (item) => {
      const dateMatch = item.date === selectedDate;
      const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
      return dateMatch && storeMatch;
    }
  );

  const filteredFixedCosts = context.fixedCosts.filter(
    (item) => {
      const dateMatch = item.date === selectedDate;
      const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
      return dateMatch && storeMatch;
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

  // Group inventory by category
  const inventoryByCategory = filteredInventory.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  // Group overheads by category
  const overheadsByCategory = filteredOverheads.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, OverheadItem[]>);

  const categoryLabels: Record<string, string> = {
    fresh_produce: 'Fresh Vegetables',
    spices_seasonings: 'Grocery',
    dairy: 'Dairy Products',
    meat: 'Meat',
    packaging: 'Packaging Materials',
    staff_essentials: 'Staff Essentials',
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

  const isClusterHead = context.user?.role === 'cluster_head';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header with Read-Only Badge */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Eye className="w-5 h-5 text-primary" />
          <h1 className="text-xl text-foreground">Inventory overview</h1>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-full">
          <Lock className="w-3.5 h-3.5 text-amber-700" />
          <span className="text-xs text-amber-800">View only</span>
        </div>
      </div>

      {/* Date Selector */}
      <DateSelector
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 mb-4">
        <StatChip label="Inventory cost" value={totalInventoryCost} />
        <StatChip label="Overhead cost" value={totalOverheadCost} />
        <StatChip label="Fixed cost" value={totalFixedCost} />
        <StatChip label="Total expenses" value={totalInventoryCost + totalOverheadCost + totalFixedCost} />
      </div>

      {/* Inventory Items by Category */}
      <SectionCard icon={<Package className="w-4 h-4" />} title="Inventory items">
        {Object.keys(inventoryByCategory).length > 0 ? (
          <div className="space-y-5">
            {Object.entries(inventoryByCategory).map(([category, items]) => (
              <div key={category}>
                <h3 className="text-xs text-muted-foreground uppercase tracking-wide mb-2 px-1">{categoryLabels[category] || category}</h3>
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
                          {item.quantity} {item.unit} · ₹{(item.costPerUnit || 0).toFixed(2)}/{item.unit}
                        </p>
                      </div>
                      <span className="text-sm text-primary flex-shrink-0">₹{(item.totalCost || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Package className="w-10 h-10" />} label="No inventory items for this date" />
        )}
      </SectionCard>

      {/* Overhead Costs by Category */}
      <SectionCard icon={<DollarSign className="w-4 h-4" />} title="Overhead costs">
        {Object.keys(overheadsByCategory).length > 0 ? (
          <div className="space-y-5">
            {Object.entries(overheadsByCategory).map(([category, items]) => (
              <div key={category}>
                <h3 className="text-xs text-muted-foreground uppercase tracking-wide mb-2 px-1">{categoryLabels[category] || category}</h3>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border bg-background p-3 flex items-center justify-between gap-3"
                    >
                      <p className="text-sm text-foreground truncate">{item.description}</p>
                      <span className="text-sm text-primary flex-shrink-0">₹{item.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<DollarSign className="w-10 h-10" />} label="No overhead costs for this date" />
        )}
      </SectionCard>

      {/* Fixed Costs */}
      {filteredFixedCosts.length > 0 && (
        <SectionCard icon={<TrendingUp className="w-4 h-4" />} title="Fixed costs">
          <div className="space-y-2">
            {filteredFixedCosts.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-background p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{categoryLabels[item.category] || item.category}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                </div>
                <span className="text-sm text-primary flex-shrink-0">₹{item.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Monthly Stock Recalibration Button */}
      {isClusterHead && (
        <div className="mt-2 mb-4">
          <button
            className="flex items-center gap-2 bg-primary hover:opacity-90 text-primary-foreground py-2.5 px-4 rounded-xl text-sm transition-opacity"
            onClick={() => setShowRecalibration(true)}
          >
            <Calendar className="w-4 h-4" />
            Monthly stock recalibration
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
