import { useState } from 'react';
import { FixedCostItem } from '../App';
import { X } from 'lucide-react';
import { FIXED_COST_CATEGORIES } from '../utils/inventoryData';

type Props = {
  selectedDate: string;
  editingItem?: FixedCostItem | null;
  onSubmit: (item: Omit<FixedCostItem, 'id'>) => void | Promise<void>;
  onClose: () => void;
};

export function FixedCostForm({ selectedDate, onSubmit, onClose, editingItem }: Props) {
  const [formData, setFormData] = useState({
    category: editingItem ? editingItem.category : 'electricity' as FixedCostItem['category'],
    description: editingItem ? editingItem.description : '',
    amount: editingItem ? editingItem.amount.toString() : ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    onSubmit({
      date: selectedDate,
      category: formData.category,
      description: formData.description,
      amount: parseFloat(formData.amount)
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-gray-900">{editingItem ? 'Edit' : 'Add'} Fixed Cost</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Category</label>
            <select
              value={formData.category}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  category: e.target.value as FixedCostItem['category']
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            >
              {Object.entries(FIXED_COST_CATEGORIES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              rows={3}
              placeholder="e.g., Monthly electricity bill, Store rent for December"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) =>
                setFormData({ ...formData, amount: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              {editingItem ? 'Update' : 'Add'} Fixed Cost
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}