import { useState, useEffect } from 'react';
import { InventoryItem, OverheadItem, FixedCostItem } from '../App';
import { INVENTORY_CATEGORIES, OVERHEAD_CATEGORIES, FIXED_COST_CATEGORIES, BUILT_IN_ITEM_BENGALI, expenseCategoryLabel } from '../utils/inventoryData';
import { Package, Receipt, Wallet, Edit2, Trash2, Loader2, AlertTriangle, Banknote, Smartphone, Coins } from 'lucide-react';
import * as api from '../utils/api';
import type { PriceFlag } from '../utils/expenseChecks';
import { toast } from 'sonner';

type Props = {
  inventory: InventoryItem[];
  overheads: OverheadItem[];
  fixedCosts: FixedCostItem[];
  onEditInventory: (item: InventoryItem) => void;
  onDeleteInventory: (id: string) => void | Promise<void>;
  onEditOverhead: (item: OverheadItem) => void;
  onDeleteOverhead: (id: string) => void | Promise<void>;
  onEditFixedCost: (item: FixedCostItem) => void;
  onDeleteFixedCost: (id: string) => void | Promise<void>;
  isManager?: boolean;
  // Entries whose price looks like a unit slip (utils/expenseChecks.ts), by id.
  priceFlags?: Map<string, PriceFlag>;
};

// Shared payment-method pill used across all three lists below.
function PaymentBadge({
  paymentMethod,
  cashAmount,
  onlineAmount,
  onlineLabel = 'Online',
  fromProductionCash = false,
}: {
  paymentMethod?: string;
  cashAmount?: number;
  onlineAmount?: number;
  onlineLabel?: string;
  fromProductionCash?: boolean; // store bill paid out of production's cash in hand
}) {
  if (!paymentMethod) return null;

  if (fromProductionCash) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-800 text-xs rounded-full">
        <Banknote className="w-3 h-3" /> Production cash
      </span>
    );
  }

  if (paymentMethod === 'both') {
    return (
      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full">
          <Banknote className="w-3 h-3" /> ₹{(cashAmount || 0).toLocaleString()}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary text-primary text-xs rounded-full">
          <Smartphone className="w-3 h-3" /> ₹{(onlineAmount || 0).toLocaleString()}
        </span>
      </div>
    );
  }

  if (paymentMethod === 'owner') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-800 text-xs rounded-full">
        <Coins className="w-3 h-3" /> Own money
      </span>
    );
  }

  if (paymentMethod === 'cash') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full">
        <Banknote className="w-3 h-3" /> Cash
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary text-primary text-xs rounded-full">
      <Smartphone className="w-3 h-3" /> {onlineLabel}
    </span>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-primary flex-shrink-0">
        {icon}
      </div>
      <h3 className="text-foreground font-bold tracking-tight">{title}</h3>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground text-center py-10">{label}</p>;
}

export function InventoryList({
  inventory,
  overheads,
  fixedCosts,
  onEditInventory,
  onDeleteInventory,
  onEditOverhead,
  onDeleteOverhead,
  onEditFixedCost,
  onDeleteFixedCost,
  isManager = true,
  priceFlags,
}: Props) {
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'inventory' | 'overhead' | 'fixedcost', id: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [customItems, setCustomItems] = useState<api.CustomItem[]>([]);

  useEffect(() => {
    api.getCustomItems().then(setCustomItems).catch(() => {});
  }, []);

  const getItemMeta = (itemName: string, category: string) =>
    customItems.find((ci) => ci.category === category && ci.itemName.trim().toLowerCase() === itemName.trim().toLowerCase());

  // Helper function to format numbers - show decimals only if needed
  const formatNumber = (num: number): string => {
    // Round to 2 decimals
    const rounded = Math.round(num * 100) / 100;
    // If it's a whole number, don't show decimals
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2);
  };

  // Detect potential duplicate inventory items (same name, quantity, unit, costPerUnit, totalCost)
  const duplicateIds = new Set<string>();
  for (let i = 0; i < inventory.length; i++) {
    for (let j = i + 1; j < inventory.length; j++) {
      const a = inventory[i], b = inventory[j];
      if (
        a.itemName.toLowerCase().trim() === b.itemName.toLowerCase().trim() &&
        a.quantity === b.quantity &&
        a.unit === b.unit &&
        a.costPerUnit === b.costPerUnit &&
        a.totalCost === b.totalCost
      ) {
        duplicateIds.add(a.id);
        duplicateIds.add(b.id);
      }
    }
  }

  // Group inventory by category
  const groupedInventory = inventory.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  // Waits for the delete, so a failed one says so instead of the dialog just closing.
  const handleDelete = async (type: 'inventory' | 'overhead' | 'fixedcost', id: string) => {
    setIsDeleting(true);
    try {
      if (type === 'inventory') {
        await onDeleteInventory(id);
      } else if (type === 'overhead') {
        await onDeleteOverhead(id);
      } else {
        await onDeleteFixedCost(id);
      }
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting entry:', error);
      toast.error(error instanceof Error && error.message ? `Couldn't delete: ${error.message}` : "Couldn't delete this entry. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4">
        {/* Inventory Items */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <SectionHeader icon={<Package className="w-4 h-4" />} title="Inventory items" />

          {inventory.length === 0 ? (
            <EmptyState label="No inventory items for this date" />
          ) : (
            <div className="space-y-5">
              {Object.entries(groupedInventory).map(([category, items]) => {
                const categoryTotal = items.reduce((sum, item) => sum + item.totalCost, 0);

                return (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-2 px-1">
                      <h4 className="text-xs text-muted-foreground uppercase tracking-wide">
                        {expenseCategoryLabel(category)}
                      </h4>
                      <span className="text-xs text-primary">
                        ₹{categoryTotal.toLocaleString()}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => {
                        const meta = getItemMeta(item.itemName, item.category);
                        const bengali = meta?.itemNameBengali || BUILT_IN_ITEM_BENGALI[item.itemName];
                        const isDuplicate = duplicateIds.has(item.id);
                        return (
                          <div
                            key={item.id}
                            className={`rounded-xl border p-3 transition-colors group flex items-center gap-3 ${
                              isDuplicate
                                ? 'border-amber-300 bg-amber-50'
                                : 'border-border bg-background hover:border-primary/40'
                            }`}
                          >
                            <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 text-lg">
                              {meta?.emoji || '📦'}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm text-foreground truncate">
                                  {item.itemName}
                                  {bengali ? ` (${bengali})` : ''}
                                </p>
                                {isDuplicate && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-200 text-amber-800 text-[10px] rounded-full flex-shrink-0">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    Duplicate?
                                  </span>
                                )}
                                {priceFlags?.has(item.id) && (
                                  <span title={priceFlags.get(item.id)!.message} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-200 text-amber-800 text-[10px] rounded-full flex-shrink-0">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    Check unit
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground">
                                  {formatNumber(item.quantity || 0)} {item.unit} · ₹{formatNumber(item.costPerUnit || 0)}/{item.unit}
                                </span>
                                <PaymentBadge
                                  paymentMethod={item.paymentMethod}
                                  cashAmount={item.cashAmount}
                                  onlineAmount={item.onlineAmount}
                                  fromProductionCash={!!item.paidFromProductionHouseId}
                                />
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-sm text-primary">₹{item.totalCost.toLocaleString()}</span>
                              {isManager && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => onEditInventory(item)}
                                    className="p-1.5 hover:bg-secondary rounded-lg text-primary transition-colors"
                                    title="Edit"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirm({ type: 'inventory', id: item.id })}
                                    className="p-1.5 hover:bg-red-50 rounded-lg text-red-600 transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Overhead Costs */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <SectionHeader icon={<Receipt className="w-4 h-4" />} title="Overhead costs" />

          {overheads.length === 0 ? (
            <EmptyState label="No overhead costs for this date" />
          ) : (
            <div className="space-y-2">
              {overheads.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-border bg-background p-3 hover:border-primary/40 transition-colors group flex items-start gap-3"
                >
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 text-primary">
                    <Coins className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{expenseCategoryLabel(item.category)}</p>
                    {item.category === 'personal_expense' && item.employeeId && item.employeeName && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.employeeName} · {item.employeeId}
                      </p>
                    )}
                    {item.category === 'personal_expense' && item.expenseMonth && (
                      <p className="text-xs text-primary mt-0.5">
                        Mapped to {new Date(item.expenseMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                    {item.paymentMethod && (
                      <div className="mt-2">
                        <PaymentBadge
                          paymentMethod={item.paymentMethod}
                          cashAmount={item.cashAmount}
                          onlineAmount={item.onlineAmount}
                          onlineLabel="Paytm"
                          fromProductionCash={!!item.paidFromProductionHouseId}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm text-primary">₹{item.amount.toLocaleString()}</span>
                    {isManager && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => onEditOverhead(item)}
                          className="p-1.5 hover:bg-secondary rounded-lg text-primary transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'overhead', id: item.id })}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fixed Costs */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <SectionHeader icon={<Wallet className="w-4 h-4" />} title="Fixed costs" />

          {fixedCosts.length === 0 ? (
            <EmptyState label="No fixed costs for this date" />
          ) : (
            <div className="space-y-2">
              {fixedCosts.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-border bg-background p-3 hover:border-primary/40 transition-colors group flex items-start gap-3"
                >
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 text-primary">
                    <Wallet className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{expenseCategoryLabel(item.category)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                    {item.category === 'lpg_gas' && item.units && item.unitPrice && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.units} cylinder{item.units > 1 ? 's' : ''} × ₹{item.unitPrice.toLocaleString()}
                      </p>
                    )}
                    {item.paymentMethod && (
                      <div className="mt-2">
                        <PaymentBadge
                          paymentMethod={item.paymentMethod}
                          cashAmount={item.cashAmount}
                          onlineAmount={item.onlineAmount}
                          onlineLabel="Paytm"
                          fromProductionCash={!!item.paidFromProductionHouseId}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm text-primary">₹{item.amount.toLocaleString()}</span>
                    {isManager && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => onEditFixedCost(item)}
                          className="p-1.5 hover:bg-secondary rounded-lg text-primary transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'fixedcost', id: item.id })}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-2xl max-w-md w-full p-6">
            <h3 className="text-foreground font-bold mb-3">Delete this entry?</h3>
            <p className="text-muted-foreground mb-6 text-sm">
              This {deleteConfirm.type === 'inventory' ? 'inventory item' : deleteConfirm.type === 'overhead' ? 'overhead cost' : 'fixed cost'} will be removed. This can't be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 border border-border text-foreground rounded-xl hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.type, deleteConfirm.id)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
