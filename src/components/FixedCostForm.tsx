import { useState, useEffect } from 'react';
import { FixedCostItem } from '../App';
import { X, Loader2 } from 'lucide-react';
import { FIXED_COST_CATEGORIES, SELECTABLE_FIXED_COST_CATEGORIES } from '../utils/inventoryData';
import { ProductionCashChoice, productionCashChoiceAvailable } from './ProductionCashChoice';
import type { CashCover } from '../utils/cashSource';

type Props = {
  selectedDate: string;
  editingItem?: FixedCostItem | null;
  onSubmit: (item: Omit<FixedCostItem, 'id'>) => void | Promise<void>;
  onClose: () => void;
  // Cluster head only: "My own money" - a cost that takes nothing from store/production cash or Paytm.
  allowOwnerPayment?: boolean;
  // Cluster head, store expense: the linked production house, and both tills' cash for the
  // day - production's cash is offered only when the store's can't cover the bill.
  productionCashHouseId?: string | null;
  productionCashCover?: CashCover | null;
};

export function FixedCostForm({ selectedDate, onSubmit, onClose, editingItem, allowOwnerPayment = false, productionCashHouseId = null, productionCashCover = null }: Props) {
  const [fromProductionCash, setFromProductionCash] = useState(!!editingItem?.paidFromProductionHouseId);
  const [formData, setFormData] = useState({
    category: editingItem ? editingItem.category : 'electricity' as FixedCostItem['category'],
    description: editingItem ? editingItem.description : '',
    amount: editingItem ? editingItem.amount.toString() : '',
    units: editingItem?.units ? editingItem.units.toString() : '',
    unitPrice: editingItem?.unitPrice ? editingItem.unitPrice.toString() : '',
    paymentMethod: editingItem?.paymentMethod || 'cash' as 'cash' | 'online' | 'both' | 'owner',
    cashAmount: editingItem?.cashAmount ? editingItem.cashAmount.toString() : '',
    onlineAmount: editingItem?.onlineAmount ? editingItem.onlineAmount.toString() : ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate total amount for LPG
  const totalAmount = formData.category === 'lpg_gas' && formData.units && formData.unitPrice
    ? parseFloat(formData.units) * parseFloat(formData.unitPrice)
    : parseFloat(formData.amount || '0');

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

  // Validate split amounts add up to total
  const splitAmountsValid = () => {
    if (formData.paymentMethod !== 'both') return true;
    const cash = parseFloat(formData.cashAmount || '0');
    const online = parseFloat(formData.onlineAmount || '0');
    return Math.abs((cash + online) - totalAmount) < 0.01; // Allow small floating point differences
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!splitAmountsValid()) {
      alert('Cash and Online amounts must add up to the total amount!');
      return;
    }

    const calculatedAmount = formData.category === 'lpg_gas' 
      ? parseFloat(formData.units) * parseFloat(formData.unitPrice)
      : parseFloat(formData.amount);

    const baseData: any = {
      date: selectedDate,
      category: formData.category,
      description: formData.description,
      amount: calculatedAmount,
      paymentMethod: formData.paymentMethod
    };
    
    // Add LPG specific fields if category is lpg_gas
    if (formData.category === 'lpg_gas') {
      baseData.units = parseFloat(formData.units);
      baseData.unitPrice = parseFloat(formData.unitPrice);
    }

    // Calculate payment method amounts
    if (formData.paymentMethod === 'both') {
      baseData.cashAmount = parseFloat(formData.cashAmount);
      baseData.onlineAmount = parseFloat(formData.onlineAmount);
    } else if (formData.paymentMethod === 'online') {
      // For online payment, set onlineAmount to total amount
      baseData.onlineAmount = calculatedAmount;
      baseData.cashAmount = 0;
    } else if (formData.paymentMethod === 'cash') {
      // For cash payment, set cashAmount to total amount
      baseData.cashAmount = calculatedAmount;
      baseData.onlineAmount = 0;
    } else if (formData.paymentMethod === 'owner') {
      baseData.cashAmount = 0;
      baseData.onlineAmount = 0;
    }
    if (productionCashHouseId) {
      baseData.paidFromProductionHouseId = formData.paymentMethod === 'cash' && fromProductionCash
        && productionCashChoiceAvailable(calculatedAmount, productionCashCover, editingItem) ? productionCashHouseId : null;
    }

    console.log('💳 Fixed cost payment data being sent:', {
      paymentMethod: baseData.paymentMethod,
      cashAmount: baseData.cashAmount,
      onlineAmount: baseData.onlineAmount
    });

    setIsSubmitting(true);
    Promise.resolve(onSubmit(baseData)).finally(() => setIsSubmitting(false));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
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
              {Object.entries(SELECTABLE_FIXED_COST_CATEGORIES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
              {/* An old LPG entry being edited keeps its category visible */}
              {!(formData.category in SELECTABLE_FIXED_COST_CATEGORIES) && (
                <option value={formData.category}>{FIXED_COST_CATEGORIES[formData.category] || formData.category}</option>
              )}
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
              placeholder={
                formData.category === 'lpg_gas'
                  ? 'e.g., Commercial LPG cylinder purchase'
                  : 'e.g., Monthly electricity bill, Store rent for December'
              }
              required
            />
          </div>

          {formData.category === 'lpg_gas' ? (
            <>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Number of Cylinders</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={formData.units}
                  onChange={(e) =>
                    setFormData({ ...formData, units: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., 2"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">Price per Cylinder (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.unitPrice}
                  onChange={(e) =>
                    setFormData({ ...formData, unitPrice: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., 1450.00"
                  required
                />
              </div>

              {formData.units && formData.unitPrice && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-900">
                    <strong>Total Amount:</strong> ₹{totalAmount.toFixed(2)}
                  </p>
                </div>
              )}
            </>
          ) : (
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
          )}

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
                  className="w-4 h-4 text-green-600"
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
                  className="w-4 h-4 text-green-600"
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
                  className="w-4 h-4 text-green-600"
                />
                <div className="flex-1">
                  <span className="text-gray-900">💰 Both (Split Payment)</span>
                  <p className="text-xs text-gray-500">Paid using both Cash and Online</p>
                </div>
              </label>
              {(allowOwnerPayment || editingItem?.paymentMethod === 'owner') && (
                <label className="flex items-center gap-2 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="owner"
                    checked={formData.paymentMethod === 'owner'}
                    onChange={() => setFormData({ ...formData, paymentMethod: 'owner' })}
                    className="w-4 h-4 text-orange-600"
                  />
                  <div className="flex-1">
                    <span className="text-gray-900">🙋 My own money (cluster head)</span>
                    <p className="text-xs text-gray-500">Counts as a cost, but takes nothing from the store's or production house's cash or Paytm</p>
                  </div>
                </label>
              )}
              {productionCashHouseId && formData.paymentMethod === 'cash' && (
                <ProductionCashChoice checked={fromProductionCash} onChange={setFromProductionCash} amount={totalAmount} cover={productionCashCover} editingItem={editingItem} />
              )}
            </div>
          </div>

          {/* Split Payment Amounts */}
          {formData.paymentMethod === 'both' && totalAmount > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-orange-900">Split Payment Details</p>
              
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

              <div className="flex justify-between text-sm pt-2 border-t border-orange-300">
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
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Saving...' : editingItem ? 'Update Fixed Cost' : 'Add Fixed Cost'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}