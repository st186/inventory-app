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
  { value: 'utensils', label: '🍴 Utensils' },
  { value: 'equipments', label: '🔨 Equipments' },
  { value: 'miscellaneous', label: '📝 Miscellaneous Cost' }
] as const;

export function OverheadForm({ selectedDate, onSubmit, onClose, editingItem, employees }: Props) {
  const [formData, setFormData] = useState({
    category: editingItem ? editingItem.category : 'fuel' as OverheadItem['category'],
    description: editingItem ? editingItem.description : '',
    amount: editingItem ? editingItem.amount.toString() : '',
    employeeId: editingItem?.employeeId || '',
    employeeName: editingItem?.employeeName || '',
    paymentMethod: editingItem?.paymentMethod || 'cash' as 'cash' | 'online' | 'both',
    cashAmount: editingItem?.cashAmount ? editingItem.cashAmount.toString() : '',
    onlineAmount: editingItem?.onlineAmount ? editingItem.onlineAmount.toString() : ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate total amount
  const totalAmount = parseFloat(formData.amount || '0');

  // Auto-calculate split amounts when payment method changes
  useEffect(() => {
    if (formData.paymentMethod === 'both' && totalAmount > 0) {
      // If switching to "both" and amounts aren't set, default to 50/50 split
      if (!formData.cashAmount && !formData.onlineAmount) {
        const half = (totalAmount / 2).toFixed(2);
        setFormData(prev => ({
          ...prev,
          cashAmount: half,
          onlineAmount: half
        }));
      }
    }
  }, [formData.paymentMethod, totalAmount]);

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

  // Validate split amounts add up to total
  const splitAmountsValid = () => {
    if (formData.paymentMethod !== 'both') return true;
    const cash = parseFloat(formData.cashAmount || '0');
    const online = parseFloat(formData.onlineAmount || '0');
    return Math.abs((cash + online) - totalAmount) < 0.01; // Allow small floating point differences
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent duplicate submissions
    if (isSubmitting) {
      console.log('⚠️ Submission already in progress, ignoring duplicate request');
      return;
    }

    if (!splitAmountsValid()) {
      alert('Cash and Online amounts must add up to the total amount!');
      return;
    }
    
    setIsSubmitting(true);
    
    const submissionData: Omit<OverheadItem, 'id'> = {
      date: selectedDate,
      category: formData.category,
      description: formData.description,
      amount: parseFloat(formData.amount),
      paymentMethod: formData.paymentMethod
    };

    // Add employee data only for personal_expense category
    if (formData.category === 'personal_expense') {
      submissionData.employeeId = formData.employeeId;
      submissionData.employeeName = formData.employeeName;
    }

    // Add payment split amounts if payment method is 'both'
    if (formData.paymentMethod === 'both') {
      submissionData.cashAmount = parseFloat(formData.cashAmount);
      submissionData.onlineAmount = parseFloat(formData.onlineAmount);
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

          {/* Payment Method Section */}
          <div className="border-t border-gray-200 pt-4 mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="cash"
                  checked={formData.paymentMethod === 'cash'}
                  onChange={(e) => setFormData({ ...formData, paymentMethod: 'cash' })}
                  className="w-4 h-4 text-orange-600"
                />
                <div className="flex-1">
                  <span className="text-gray-900">💵 Cash in Hand</span>
                  <p className="text-xs text-gray-500">Will reduce Expected Cash in Hand</p>
                </div>
              </label>

              <label className="flex items-center gap-2 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="online"
                  checked={formData.paymentMethod === 'online'}
                  onChange={(e) => setFormData({ ...formData, paymentMethod: 'online' })}
                  className="w-4 h-4 text-orange-600"
                />
                <div className="flex-1">
                  <span className="text-gray-900">📱 Online Cash (Paytm)</span>
                  <p className="text-xs text-gray-500">Will reduce Online Cash in Hand (Paytm)</p>
                </div>
              </label>

              <label className="flex items-center gap-2 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="both"
                  checked={formData.paymentMethod === 'both'}
                  onChange={(e) => setFormData({ ...formData, paymentMethod: 'both' })}
                  className="w-4 h-4 text-orange-600"
                />
                <div className="flex-1">
                  <span className="text-gray-900">💰 Both (Split Payment)</span>
                  <p className="text-xs text-gray-500">Paid using both Cash and Online</p>
                </div>
              </label>
            </div>
          </div>

          {/* Split Payment Amounts */}
          {formData.paymentMethod === 'both' && totalAmount > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-purple-900">Split Payment Details</p>
              
              <div>
                <label className="block text-sm text-gray-700 mb-1">Cash Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={totalAmount}
                  value={formData.cashAmount}
                  onChange={(e) => {
                    const cash = parseFloat(e.target.value || '0');
                    setFormData({ 
                      ...formData, 
                      cashAmount: e.target.value,
                      onlineAmount: (totalAmount - cash).toFixed(2)
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">Online Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={totalAmount}
                  value={formData.onlineAmount}
                  onChange={(e) => {
                    const online = parseFloat(e.target.value || '0');
                    setFormData({ 
                      ...formData, 
                      onlineAmount: e.target.value,
                      cashAmount: (totalAmount - online).toFixed(2)
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>

              <div className="flex justify-between text-sm pt-2 border-t border-purple-300">
                <span className="text-gray-700">Total:</span>
                <span className={`font-medium ${splitAmountsValid() ? 'text-green-600' : 'text-red-600'}`}>
                  ₹{(parseFloat(formData.cashAmount || '0') + parseFloat(formData.onlineAmount || '0')).toFixed(2)} / ₹{totalAmount.toFixed(2)}
                </span>
              </div>
              
              {!splitAmountsValid() && (
                <p className="text-xs text-red-600">⚠️ Amounts must add up to ₹{totalAmount.toFixed(2)}</p>
              )}
            </div>
          )}

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