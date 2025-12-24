import { useState } from 'react';
import { InventoryContextType, InventoryItem, OverheadItem } from '../App';
import { InventoryForm } from './InventoryForm';
import { OverheadForm } from './OverheadForm';
import { InventoryList } from './InventoryList';
import { DatePicker } from './DatePicker';
import { Plus } from 'lucide-react';

type Props = {
  context: InventoryContextType;
};

export function InventoryManagement({ context }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [showInventoryForm, setShowInventoryForm] = useState(false);
  const [showOverheadForm, setShowOverheadForm] = useState(false);
  const [editingInventory, setEditingInventory] = useState<InventoryItem | null>(null);
  const [editingOverhead, setEditingOverhead] = useState<OverheadItem | null>(null);

  const changeDate = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const filteredInventory = context.inventory.filter(
    (item) => item.date === selectedDate
  );
  const filteredOverheads = context.overheads.filter(
    (item) => item.date === selectedDate
  );

  const totalInventoryCost = filteredInventory.reduce(
    (sum, item) => sum + item.totalCost,
    0
  );
  const totalOverheadCost = filteredOverheads.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Date Selector */}
      <DatePicker
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 shadow-lg shadow-blue-500/30">
          <p className="text-sm text-blue-100 uppercase tracking-wide">Inventory Cost</p>
          <p className="text-white text-2xl mt-2">₹{totalInventoryCost.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 shadow-lg shadow-orange-500/30">
          <p className="text-sm text-orange-100 uppercase tracking-wide">Overhead Cost</p>
          <p className="text-white text-2xl mt-2">₹{totalOverheadCost.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 shadow-lg shadow-purple-500/30">
          <p className="text-sm text-purple-100 uppercase tracking-wide">Total Expenses</p>
          <p className="text-white text-2xl mt-2">
            ₹{(totalInventoryCost + totalOverheadCost).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setShowInventoryForm(true)}
          disabled={!context.isManager}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={!context.isManager ? 'Only managers can add inventory items' : ''}
        >
          <Plus className="w-4 h-4" />
          Add Inventory Item
        </button>
        <button
          onClick={() => setShowOverheadForm(true)}
          disabled={!context.isManager}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={!context.isManager ? 'Only managers can add overhead costs' : ''}
        >
          <Plus className="w-4 h-4" />
          Add Overhead
        </button>
      </div>

      {/* Lists */}
      <InventoryList
        inventory={filteredInventory}
        overheads={filteredOverheads}
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
              } else {
                await context.addInventoryItem(item);
              }
              setShowInventoryForm(false);
              setEditingInventory(null);
            } catch (error) {
              alert('Failed to save inventory item. Please try again.');
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
          onSubmit={async (item) => {
            try {
              if (editingOverhead) {
                await context.updateOverheadItem(editingOverhead.id, item);
              } else {
                await context.addOverheadItem(item);
              }
              setShowOverheadForm(false);
              setEditingOverhead(null);
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
    </div>
  );
}