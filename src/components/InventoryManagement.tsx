import { useState, useMemo, useEffect } from 'react';
import { InventoryContextType, InventoryItem, OverheadItem, FixedCostItem } from '../App';
import { Employee } from '../utils/api';
import { InventoryForm } from './InventoryForm';
import { OverheadForm } from './OverheadForm';
import { FixedCostForm } from './FixedCostForm';
import { InventoryList } from './InventoryList';
import { DateSelector } from './DateSelector';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { getTodayIST, formatDateIST } from '../utils/timezone';

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
  console.log('🏪 InventoryManagement - effectiveStoreId:', effectiveStoreId);
  console.log('🏪 InventoryManagement - selectedStoreId prop:', selectedStoreId);
  console.log('🏪 InventoryManagement - user storeId:', context.user?.storeId);

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Date Selector */}
      <DateSelector
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6 mb-6">
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
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 shadow-lg shadow-purple-500/30">
          <p className="text-sm text-purple-100 uppercase tracking-wide">Total Expenses</p>
          <p className="text-white text-2xl mt-2">
            ₹{(totalInventoryCost + totalOverheadCost + totalFixedCost).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <button
          onClick={() => setShowInventoryForm(true)}
          disabled={!context.isManager}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          title={!context.isManager ? 'Only managers can add inventory items' : ''}
        >
          <Plus className="w-4 h-4" />
          Add Inventory Item
        </button>
        <button
          onClick={() => setShowOverheadForm(true)}
          disabled={!context.isManager}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          title={!context.isManager ? 'Only managers can add overhead costs' : ''}
        >
          <Plus className="w-4 h-4" />
          Add Overhead
        </button>
        <button
          onClick={() => setShowFixedCostForm(true)}
          disabled={!context.isManager}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          title={!context.isManager ? 'Only managers can add fixed costs' : ''}
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
        isManager={context.isManager}
      />

      {/* Forms Modal */}
      {showInventoryForm && (
        <InventoryForm
          selectedDate={selectedDate}
          editingItem={editingInventory}
          onSubmit={async (item) => {
            try {
              if (editingInventory) {
                await context.updateInventoryItem(editingInventory.id, item);
                setShowInventoryForm(false);
                setEditingInventory(null);
                toast.success('Inventory item updated successfully!');
              } else {
                await context.addInventoryItem(item);
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
          onSubmit={async (item) => {
            try {
              if (editingOverhead) {
                await context.updateOverheadItem(editingOverhead.id, item);
              } else {
                await context.addOverheadItem(item);
              }
              setShowOverheadForm(false);
              setEditingOverhead(null);
              toast.success('Overhead cost saved successfully!');
            } catch (error) {
              alert('Failed to save overhead cost. Please try again.');
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
              if (editingFixedCost) {
                await context.updateFixedCostItem(editingFixedCost.id, item);
              } else {
                await context.addFixedCostItem(item);
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