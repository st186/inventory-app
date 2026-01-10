import { useState, useEffect } from 'react';
import { OverheadItem } from '../App';
import { Employee } from '../utils/api';
import { X, Loader2 } from 'lucide-react';

type Props = {
  selectedDate: string;
  editingItem?: OverheadItem | null;
  onSubmit: (item: Omit<OverheadItem, 'id'>) => void | Promise<void>;
  onClose: () => void;
  employees: Employee[];
};

const overheadCategories = [
  { value: 'fuel', label: '⛽ Fuel Cost' },
  { value: 'travel', label: '🚗 Travel by Employee' },
  { value: 'transportation', label: '🚛 Goods Transportation Cost' },
  { value: 'marketing', label: '📢 Marketing Cost' },
  { value: 'service_charge', label: '🍔 Service Charge (Food Aggregators)' },
  { value: 'repair', label: '🔧 Repair Cost' },
  { value: 'party', label: '🎉 Party Cost' },
  { value: 'lunch', label: '🍽️ Lunch Cost' },
  { value: 'emergency_online', label: '🛒 Emergency Online Order (Blinkit)' },
  { value: 'personal_expense', label: '👤 Personal Expense By an Employee' },
  { value: 'miscellaneous', label: '📝 Miscellaneous Cost' }
] as const;

export function OverheadForm({ selectedDate, onSubmit, onClose, editingItem, employees }: Props) {
  const [formData, setFormData] = useState({
    category: editingItem ? editingItem.category : 'fuel' as OverheadItem['category'],
    description: editingItem ? editingItem.description : '',
    amount: editingItem ? editingItem.amount.toString() : '',
    employeeId: editingItem?.employeeId || '',
    employeeName: editingItem?.employeeName || ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update employee name when employee ID changes
  useEffect(() => {
    if (formData.category === 'personal_expense' && formData.employeeId) {
      const selectedEmployee = employees.find(emp => emp.employeeId === formData.employeeId);
      if (selectedEmployee) {
        setFormData(prev => ({
          ...prev,
          employeeName: selectedEmployee.name
        }));
      }
    }
  }, [formData.employeeId, formData.category, employees]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent duplicate submissions
    if (isSubmitting) {
      console.log('⚠️ Submission already in progress, ignoring duplicate request');
      return;
    }
    
    setIsSubmitting(true);
    
    const submissionData: Omit<OverheadItem, 'id'> = {
      date: selectedDate,
      category: formData.category,
      description: formData.description,
      amount: parseFloat(formData.amount)
    };

    // Add employee data only for personal_expense category
    if (formData.category === 'personal_expense') {
      submissionData.employeeId = formData.employeeId;
      submissionData.employeeName = formData.employeeName;
    }

    await onSubmit(submissionData);
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-gray-900">{editingItem ? 'Edit' : 'Add'} Overhead Cost</h3>
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
                  category: e.target.value as OverheadItem['category'],
                  // Reset employee fields when category changes
                  employeeId: '',
                  employeeName: ''
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            >
              {overheadCategories.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {formData.category === 'personal_expense' && (
            <>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Employee ID</label>
                <select
                  value={formData.employeeId}
                  onChange={(e) =>
                    setFormData({ ...formData, employeeId: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="">Select Employee</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.employeeId}>
                      {emp.employeeId}
                    </option>
                  ))}
                </select>
              </div>

              {formData.employeeId && formData.employeeName && (
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Employee Name</label>
                  <input
                    type="text"
                    value={formData.employeeName}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-700 mb-1">Expense Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  rows={3}
                  placeholder="What was the expense for?"
                  required
                />
              </div>
            </>
          )}

          {formData.category !== 'personal_expense' && (
            <div>
              <label className="block text-sm text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                rows={3}
                required
              />
            </div>
          )}

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
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Saving...' : editingItem ? 'Update Overhead' : 'Add Overhead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}