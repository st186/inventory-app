import { useState, useMemo, useEffect } from 'react';
import { InventoryContextType } from '../App';
import { DollarSign, TrendingUp, Wallet, Package, Calendar, Plus, X, CheckCircle } from 'lucide-react';
import * as api from '../utils/api';

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onDataUpdate?: () => void;
};

type OnlineSalesEntry = {
  id: string;
  date: string;
  swiggySales: number;
  zomatoSales: number;
  storeId?: string;
  createdAt: string;
};

type OnlinePayoutEntry = {
  id: string;
  date: string;
  swiggyPayout: number;
  zomatoPayout: number;
  storeId?: string;
  createdAt: string;
};

export function OnlineSalesTab({ context, selectedStoreId, selectedDate, onDateChange, onDataUpdate }: Props) {
  const [swiggySales, setSwiggySales] = useState('');
  const [zomatoSales, setZomatoSales] = useState('');
  const [swiggyPayout, setSwiggyPayout] = useState('');
  const [zomatoPayout, setZomatoPayout] = useState('');
  const [onlineSalesData, setOnlineSalesData] = useState<OnlineSalesEntry[]>([]);
  const [onlinePayoutData, setOnlinePayoutData] = useState<OnlinePayoutEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const effectiveStoreId = selectedStoreId || context.user?.storeId;
  const canEdit = context.user?.role === 'manager' || context.user?.role === 'cluster_head';

  // Load online sales and payout data
  useEffect(() => {
    loadOnlineData();
  }, []);

  const loadOnlineData = async () => {
    if (!context.user) return;
    setIsLoading(true);
    try {
      // Load from KV store
      const salesResponse = await api.getOnlineSalesData(context.user.accessToken);
      const payoutResponse = await api.getOnlinePayoutData(context.user.accessToken);
      
      setOnlineSalesData(salesResponse || []);
      setOnlinePayoutData(payoutResponse || []);
    } catch (error) {
      console.error('Error loading online data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get sales for selected date
  const salesForDate = useMemo(() => {
    const filtered = effectiveStoreId
      ? onlineSalesData.filter(s => s.storeId === effectiveStoreId)
      : onlineSalesData;
    return filtered.find(s => s.date === selectedDate);
  }, [onlineSalesData, selectedDate, effectiveStoreId]);

  // Get payouts for selected date
  const payoutsForDate = useMemo(() => {
    const filtered = effectiveStoreId
      ? onlinePayoutData.filter(p => p.storeId === effectiveStoreId)
      : onlinePayoutData;
    return filtered.find(p => p.date === selectedDate);
  }, [onlinePayoutData, selectedDate, effectiveStoreId]);

  // Load data for selected date into form
  useEffect(() => {
    if (salesForDate) {
      setSwiggySales(salesForDate.swiggySales.toString());
      setZomatoSales(salesForDate.zomatoSales.toString());
    } else {
      setSwiggySales('');
      setZomatoSales('');
    }

    if (payoutsForDate) {
      setSwiggyPayout(payoutsForDate.swiggyPayout.toString());
      setZomatoPayout(payoutsForDate.zomatoPayout.toString());
    } else {
      setSwiggyPayout('');
      setZomatoPayout('');
    }
  }, [salesForDate, payoutsForDate, selectedDate]);

  // Calculate totals
  const totalSwiggySales = parseFloat(swiggySales) || 0;
  const totalZomatoSales = parseFloat(zomatoSales) || 0;
  const totalOnlineSales = totalSwiggySales + totalZomatoSales;

  const totalSwiggyPayout = parseFloat(swiggyPayout) || 0;
  const totalZomatoPayout = parseFloat(zomatoPayout) || 0;
  const totalPayout = totalSwiggyPayout + totalZomatoPayout;

  const netCommission = totalOnlineSales - totalPayout;
  const extraPayout = totalPayout - totalOnlineSales; // If payout > sales, this is positive

  // Calculate cumulative stats (all time for this store)
  const cumulativeStats = useMemo(() => {
    const filtered = effectiveStoreId
      ? onlineSalesData.filter(s => s.storeId === effectiveStoreId)
      : onlineSalesData;
    
    const filteredPayouts = effectiveStoreId
      ? onlinePayoutData.filter(p => p.storeId === effectiveStoreId)
      : onlinePayoutData;

    const totalSales = filtered.reduce((sum, s) => sum + s.swiggySales + s.zomatoSales, 0);
    const totalPayouts = filteredPayouts.reduce((sum, p) => sum + p.swiggyPayout + p.zomatoPayout, 0);
    
    return {
      totalSales,
      totalPayouts,
      netCommission: totalSales - totalPayouts
    };
  }, [onlineSalesData, onlinePayoutData, effectiveStoreId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!context.user || !canEdit) return;

    setIsSubmitting(true);
    try {
      // Save sales data
      const salesEntry: OnlineSalesEntry = {
        id: salesForDate?.id || `ONLINE-SALES-${Date.now()}`,
        date: selectedDate,
        swiggySales: totalSwiggySales,
        zomatoSales: totalZomatoSales,
        storeId: effectiveStoreId,
        createdAt: salesForDate?.createdAt || new Date().toISOString()
      };

      await api.saveOnlineSalesData(context.user.accessToken, salesEntry);

      // Save payout data
      const payoutEntry: OnlinePayoutEntry = {
        id: payoutsForDate?.id || `ONLINE-PAYOUT-${Date.now()}`,
        date: selectedDate,
        swiggyPayout: totalSwiggyPayout,
        zomatoPayout: totalZomatoPayout,
        storeId: effectiveStoreId,
        createdAt: payoutsForDate?.createdAt || new Date().toISOString()
      };

      await api.saveOnlinePayoutData(context.user.accessToken, payoutEntry);

      // If there's extra payout, add it to Online Cash in Hand (Paytm)
      if (extraPayout > 0) {
        // Find existing sales data for this date
        const existingSales = context.salesData.find(s => 
          s.date === selectedDate && 
          (!effectiveStoreId || s.storeId === effectiveStoreId)
        );

        if (existingSales) {
          // Update existing sales to add extra payout to paytmAmount
          await context.updateSalesData(existingSales.id, {
            ...existingSales,
            paytmAmount: existingSales.paytmAmount + extraPayout
          });
        }
      }

      // Reload data
      await loadOnlineData();
      
      // Notify parent component to reload its data
      if (onDataUpdate) {
        onDataUpdate();
      }
      
      alert('✅ Online sales and payout data saved successfully!');
    } catch (error) {
      console.error('Error saving online data:', error);
      alert('❌ Error saving online data. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-6 border border-purple-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Online Sales Management (Swiggy & Zomato)
        </h2>
        <p className="text-gray-600 text-sm">
          Track sales and payouts from food delivery aggregators. Extra payouts automatically add to Online Cash in Hand (Paytm).
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-6 border-2 border-green-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Total Sales (Till Now)</span>
            <DollarSign className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-600">₹{cumulativeStats.totalSales.toFixed(2)}</p>
        </div>

        <div className="bg-white rounded-lg p-6 border-2 border-blue-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Net Payout (Till Now)</span>
            <Wallet className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-blue-600">₹{cumulativeStats.totalPayouts.toFixed(2)}</p>
        </div>

        <div className="bg-white rounded-lg p-6 border-2 border-purple-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Net Commission (Till Now)</span>
            <TrendingUp className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-purple-600">₹{cumulativeStats.netCommission.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">Sales - Payout</p>
        </div>
      </div>

      {/* Daily Entry Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg p-6 border-2 border-purple-200 shadow-lg">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Daily Entry for {new Date(selectedDate).toLocaleDateString('en-IN', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
          })}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Sales Section */}
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-700 border-b pb-2">Sales Data</h4>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Swiggy Sales (₹)
              </label>
              <input
                type="number"
                step="0.01"
                value={swiggySales}
                onChange={(e) => setSwiggySales(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="0.00"
                disabled={!canEdit}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Zomato Sales (₹)
              </label>
              <input
                type="number"
                step="0.01"
                value={zomatoSales}
                onChange={(e) => setZomatoSales(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="0.00"
                disabled={!canEdit}
              />
            </div>

            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-sm font-medium text-gray-700">Total Online Sales</p>
              <p className="text-xl font-bold text-green-600">₹{totalOnlineSales.toFixed(2)}</p>
            </div>
          </div>

          {/* Payout Section */}
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-700 border-b pb-2">Payout Data</h4>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Swiggy Payout (₹)
              </label>
              <input
                type="number"
                step="0.01"
                value={swiggyPayout}
                onChange={(e) => setSwiggyPayout(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="0.00"
                disabled={!canEdit}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Zomato Payout (₹)
              </label>
              <input
                type="number"
                step="0.01"
                value={zomatoPayout}
                onChange={(e) => setZomatoPayout(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="0.00"
                disabled={!canEdit}
              />
            </div>

            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm font-medium text-gray-700">Total Payout</p>
              <p className="text-xl font-bold text-blue-600">₹{totalPayout.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Calculation Summary */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`p-4 rounded-lg ${netCommission >= 0 ? 'bg-purple-50 border-2 border-purple-200' : 'bg-red-50 border-2 border-red-200'}`}>
            <p className="text-sm font-medium text-gray-700 mb-1">Net Commission (Sales - Payout)</p>
            <p className={`text-2xl font-bold ${netCommission >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
              ₹{netCommission.toFixed(2)}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              This is the commission {netCommission >= 0 ? 'earned' : 'deficit'}
            </p>
          </div>

          {extraPayout > 0 && (
            <div className="p-4 rounded-lg bg-orange-50 border-2 border-orange-200">
              <p className="text-sm font-medium text-gray-700 mb-1">Extra Payout (Payout - Sales)</p>
              <p className="text-2xl font-bold text-orange-600">₹{extraPayout.toFixed(2)}</p>
              <p className="text-xs text-gray-600 mt-1">
                ⚡ This will be added to Online Cash in Hand (Paytm)
              </p>
            </div>
          )}
        </div>

        {/* Submit Button */}
        {canEdit && (
          <div className="mt-6">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Save Online Sales & Payout
                </>
              )}
            </button>
          </div>
        )}
      </form>

      {/* Daily Breakdown Table */}
      <div className="bg-white rounded-lg p-6 border-2 border-purple-200 shadow-lg">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Daily Breakdown</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Swiggy Sales</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Zomato Sales</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Total Sales</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Swiggy Payout</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Zomato Payout</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Total Payout</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Commission</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Combine sales and payouts by date
                const allDates = new Set([
                  ...onlineSalesData.map(s => s.date),
                  ...onlinePayoutData.map(p => p.date)
                ]);
                
                const filteredSales = effectiveStoreId
                  ? onlineSalesData.filter(s => s.storeId === effectiveStoreId)
                  : onlineSalesData;
                
                const filteredPayouts = effectiveStoreId
                  ? onlinePayoutData.filter(p => p.storeId === effectiveStoreId)
                  : onlinePayoutData;

                return Array.from(allDates)
                  .sort((a, b) => b.localeCompare(a)) // Sort descending
                  .map(date => {
                    const sales = filteredSales.find(s => s.date === date);
                    const payout = filteredPayouts.find(p => p.date === date);
                    
                    const swiggyS = sales?.swiggySales || 0;
                    const zomato = sales?.zomatoSales || 0;
                    const totalS = swiggyS + zomato;
                    
                    const swiggyP = payout?.swiggyPayout || 0;
                    const zomatoP = payout?.zomatoPayout || 0;
                    const totalP = swiggyP + zomatoP;
                    
                    const commission = totalS - totalP;

                    return (
                      <tr key={date} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-700">
                          {new Date(date).toLocaleDateString('en-IN', { 
                            day: 'numeric', 
                            month: 'short', 
                            year: 'numeric' 
                          })}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-700">₹{swiggyS.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-gray-700">₹{zomato.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-semibold text-green-600">₹{totalS.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-gray-700">₹{swiggyP.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-gray-700">₹{zomatoP.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-semibold text-blue-600">₹{totalP.toFixed(2)}</td>
                        <td className={`py-3 px-4 text-right font-semibold ${commission >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                          ₹{commission.toFixed(2)}
                        </td>
                      </tr>
                    );
                  });
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}