import { useState, useEffect } from 'react';
import { Calendar, TrendingDown, AlertTriangle, CheckCircle, XCircle, Eye, Download, Filter, RefreshCw } from 'lucide-react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { DatePicker } from './DatePicker';

type RecalibrationReportsProps = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
  onOpenRecalibration?: () => void;
  locationType?: 'store' | 'production_house'; // CRITICAL: Separate store and production house data
};

export function RecalibrationReports({ context, selectedStoreId, onOpenRecalibration, locationType }: RecalibrationReportsProps) {
  const [view, setView] = useState<'pending' | 'history' | 'wastage'>('pending');
  const [pendingRecalibrations, setPendingRecalibrations] = useState<any[]>([]);
  const [historyRecalibrations, setHistoryRecalibrations] = useState<any[]>([]);
  const [wastageReport, setWastageReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [selectedRecalibration, setSelectedRecalibration] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Determine effective location ID for queries
  const isClusterHead = context.user?.role === 'cluster_head';
  const isManager = context.user?.role === 'manager';
  const isProductionIncharge = context.user?.designation === 'production_incharge';
  
  // CRITICAL FIX: For Production Analytics, Cluster Heads should ALWAYS see all production houses
  // regardless of which specific production house is selected from the dropdown
  // This is because production house selection in Production Analytics is just for filtering
  // production logs/requests, NOT for recalibration reports which should show cluster-wide data
  const effectiveStoreId = isClusterHead && !selectedStoreId 
    ? 'all-cluster-locations' 
    : isClusterHead && locationType === 'production_house'
    ? 'all-cluster-locations'  // Always show all production houses for cluster heads
    : (selectedStoreId || context.user?.storeId);
  
  // DEBUG: Log the IDs being used
  console.log('🔍 RecalibrationReports - ID Debug:');
  console.log('  - selectedStoreId (prop):', selectedStoreId);
  console.log('  - context.user?.storeId:', context.user?.storeId);
  console.log('  - effectiveStoreId (computed):', effectiveStoreId);
  console.log('  - locationType:', locationType);
  console.log('  - isClusterHead:', isClusterHead);
  console.log('  - Production Houses:', context.productionHouses?.map(ph => ({ id: ph.id, name: ph.name })));

  useEffect(() => {
    if (view === 'pending' && (isClusterHead || isManager)) {
      fetchPendingRecalibrations();
    } else if (view === 'history') {
      fetchHistoryRecalibrations();
    } else if (view === 'wastage') {
      fetchWastageReport();
    }
  }, [view, selectedMonth, effectiveStoreId]);

  async function fetchPendingRecalibrations() {
    try {
      setLoading(true);
      const response = await api.getAllRecalibrationsForApproval(context.user?.accessToken || '');
      setPendingRecalibrations(response.recalibrations || []);
    } catch (error) {
      console.error('Error fetching pending recalibrations:', error);
      toast.error('Failed to fetch pending recalibrations');
    } finally {
      setLoading(false);
    }
  }

  async function fetchHistoryRecalibrations() {
    if (!effectiveStoreId) return;

    try {
      setLoading(true);
      
      console.log('📋 Fetching recalibration history:');
      console.log('  - effectiveStoreId:', effectiveStoreId);
      console.log('  - selectedStoreId:', selectedStoreId);
      console.log('  - locationType:', locationType);
      console.log('  - isClusterHead:', isClusterHead);
      console.log('  - user.storeId:', context.user?.storeId);
      
      const response = await api.getRecalibrationHistory(
        context.user?.accessToken || '',
        effectiveStoreId,
        locationType
      );
      
      console.log('📋 History response:', response);
      console.log('📋 History records found:', response?.history?.length || 0);
      if (response?.history?.length > 0) {
        console.log('📋 Sample record locationIds:', response.history.slice(0, 3).map((r: any) => r.locationId));
      }
      
      setHistoryRecalibrations(response.history || []);
    } catch (error) {
      console.error('Error fetching recalibration history:', error);
      toast.error('Failed to fetch recalibration history');
    } finally {
      setLoading(false);
    }
  }

  async function fetchWastageReport() {
    try {
      setLoading(true);
      
      console.log('📊 Fetching wastage report:');
      console.log('  - month:', selectedMonth);
      console.log('  - effectiveStoreId:', effectiveStoreId);
      console.log('  - selectedStoreId:', selectedStoreId);
      console.log('  - locationType:', locationType);
      console.log('  - isClusterHead:', isClusterHead);
      
      const response = await api.getMonthlyWastageReport(
        context.user?.accessToken || '',
        selectedMonth,
        effectiveStoreId,
        locationType
      );
      
      console.log('📊 Wastage response:', response);
      console.log('📊 Wastage items found:', response?.items?.length || 0);
      if (response?.items?.length > 0) {
        console.log('📊 Sample item locationIds:', response.items.slice(0, 3).map((i: any) => i.locationId));
      }
      
      setWastageReport(response);
    } catch (error) {
      console.error('Error fetching wastage report:', error);
      toast.error('Failed to fetch wastage report');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(recalibrationId: string) {
    try {
      await api.approveRecalibration(context.user?.accessToken || '', recalibrationId);
      toast.success('Recalibration approved successfully');
      fetchPendingRecalibrations();
    } catch (error) {
      console.error('Error approving recalibration:', error);
      toast.error('Failed to approve recalibration');
    }
  }

  async function handleReject(recalibrationId: string) {
    const reason = prompt('Please enter reason for rejection:');
    if (!reason) return;

    try {
      await api.rejectRecalibration(context.user?.accessToken || '', recalibrationId, reason);
      toast.success('Recalibration rejected');
      fetchPendingRecalibrations();
    } catch (error) {
      console.error('Error rejecting recalibration:', error);
      toast.error('Failed to reject recalibration');
    }
  }

  function viewDetails(recalibration: any) {
    setSelectedRecalibration(recalibration);
    setShowDetailModal(true);
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl p-6 text-white flex-1">
          <h2 className="text-2xl mb-2">Stock Recalibration Reports</h2>
          <p className="text-purple-100">
            {view === 'pending' && 'Review and approve monthly stock recalibrations'}
            {view === 'history' && 'View historical recalibration records'}
            {view === 'wastage' && 'Analyze monthly wastage and counting errors'}
          </p>
        </div>
        {onOpenRecalibration && view === 'history' && locationType !== 'production_house' && (
          <button
            onClick={onOpenRecalibration}
            className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl hover:from-emerald-700 hover:to-green-700 transition-all shadow-lg flex items-center gap-2"
          >
            <Calendar className="w-5 h-5" />
            New Recalibration
          </button>
        )}
      </div>

      {/* View Toggle */}
      <div className="flex gap-2 bg-white rounded-lg p-2 shadow-sm">
        {(isClusterHead || isManager) && (
          <button
            onClick={() => setView('pending')}
            className={`flex-1 px-4 py-2 rounded-lg transition-all ${
              view === 'pending'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Pending Approval
          </button>
        )}
        <button
          onClick={() => setView('history')}
          className={`flex-1 px-4 py-2 rounded-lg transition-all ${
            view === 'history'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          History
        </button>
        <button
          onClick={() => setView('wastage')}
          className={`flex-1 px-4 py-2 rounded-lg transition-all ${
            view === 'wastage'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Wastage Report
        </button>
      </div>

      {/* Wastage Report Month Selector */}
      {view === 'wastage' && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <label className="block text-sm text-gray-700 mb-2">Select Month</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
          />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-lg p-12 text-center shadow-sm">
          <RefreshCw className="w-12 h-12 text-purple-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      ) : (
        <>
          {/* Pending Approval View */}
          {view === 'pending' && (
            <div className="space-y-4">
              {pendingRecalibrations.length === 0 ? (
                <div className="bg-white rounded-lg p-12 text-center shadow-sm">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <p className="text-gray-600">No pending recalibrations</p>
                </div>
              ) : (
                pendingRecalibrations.map((recal) => (
                  <div
                    key={recal.id}
                    className="bg-white rounded-lg p-6 shadow-sm border-2 border-gray-200 hover:border-purple-300 transition-all"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg text-gray-900 mb-1">
                          {recal.locationName}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {formatDate(recal.date)} • {recal.locationType === 'production_house' ? 'Production House' : 'Store'}
                        </p>
                      </div>
                      <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm">
                        Pending Approval
                      </span>
                    </div>

                    {/* Summary Stats */}
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-xs text-red-600 mb-1">Wastage Items</p>
                        <p className="text-xl text-red-700">
                          {recal.items?.filter((i: any) => i.adjustmentType === 'wastage').length || 0}
                        </p>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-3">
                        <p className="text-xs text-orange-600 mb-1">Counting Errors</p>
                        <p className="text-xl text-orange-700">
                          {recal.items?.filter((i: any) => i.adjustmentType === 'counting_error').length || 0}
                        </p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs text-blue-600 mb-1">Total Items</p>
                        <p className="text-xl text-blue-700">
                          {recal.items?.length || 0}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => viewDetails(recal)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        View Details
                      </button>
                      <button
                        onClick={() => handleApprove(recal.id)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(recal.id)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* History View */}
          {view === 'history' && (
            <div className="space-y-4">
              {historyRecalibrations.length === 0 ? (
                <div className="bg-white rounded-lg p-12 text-center shadow-sm">
                  <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No recalibration history found</p>
                </div>
              ) : (
                historyRecalibrations.map((recal) => (
                  <div
                    key={recal.id}
                    className="bg-white rounded-lg p-6 shadow-sm border-2 border-gray-200"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg text-gray-900 mb-1">
                          {recal.locationName}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {formatDate(recal.date)}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-sm ${
                          recal.status === 'approved'
                            ? 'bg-green-100 text-green-700'
                            : recal.status === 'rejected'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {recal.status?.charAt(0).toUpperCase() + recal.status?.slice(1) || 'Pending'}
                      </span>
                    </div>

                    <button
                      onClick={() => viewDetails(recal)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      View Details
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Wastage Report View */}
          {view === 'wastage' && (
            <div className="bg-white rounded-lg p-6 shadow-sm">
              {!wastageReport || wastageReport.items?.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingDown className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No wastage data for selected month</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg p-4 text-white">
                      <p className="text-sm opacity-90 mb-1">Total Wastage</p>
                      <p className="text-2xl">{wastageReport.summary?.totalWastage || 0}</p>
                      <p className="text-xs opacity-75 mt-1">items</p>
                    </div>
                    <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-4 text-white">
                      <p className="text-sm opacity-90 mb-1">Counting Errors</p>
                      <p className="text-2xl">{wastageReport.summary?.totalCountingErrors || 0}</p>
                      <p className="text-xs opacity-75 mt-1">items</p>
                    </div>
                    <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-4 text-white">
                      <p className="text-sm opacity-90 mb-1">Recalibrations</p>
                      <p className="text-2xl">{wastageReport.summary?.totalRecalibrations || 0}</p>
                      <p className="text-xs opacity-75 mt-1">this month</p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-4 text-white">
                      <p className="text-sm opacity-90 mb-1">Locations</p>
                      <p className="text-2xl">{wastageReport.summary?.uniqueLocations || 0}</p>
                      <p className="text-xs opacity-75 mt-1">stores/houses</p>
                    </div>
                  </div>

                  {/* Detailed Items Table */}
                  <div>
                    <h3 className="text-lg text-gray-900 mb-3">Wastage & Error Details</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="text-left p-3 text-sm text-gray-700">Item Name</th>
                            <th className="text-left p-3 text-sm text-gray-700">Location</th>
                            <th className="text-center p-3 text-sm text-gray-700">System Qty</th>
                            <th className="text-center p-3 text-sm text-gray-700">Actual Qty</th>
                            <th className="text-center p-3 text-sm text-gray-700">Difference</th>
                            <th className="text-center p-3 text-sm text-gray-700">Type</th>
                            <th className="text-left p-3 text-sm text-gray-700">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wastageReport.items?.map((item: any, index: number) => (
                            <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                              <td className="p-3 text-sm text-gray-900">{item.itemName}</td>
                              <td className="p-3 text-sm text-gray-600">{item.locationName}</td>
                              <td className="p-3 text-sm text-center text-gray-900">
                                {item.systemQuantity} {item.unit}
                              </td>
                              <td className="p-3 text-sm text-center text-gray-900">
                                {item.actualQuantity} {item.unit}
                              </td>
                              <td className={`p-3 text-sm text-center ${
                                item.difference < 0 ? 'text-red-600' : 'text-green-600'
                              }`}>
                                {item.difference > 0 ? '+' : ''}{item.difference}
                              </td>
                              <td className="p-3 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  item.adjustmentType === 'wastage'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-orange-100 text-orange-700'
                                }`}>
                                  {item.adjustmentType === 'wastage' ? 'Wastage' : 'Counting Error'}
                                </span>
                              </td>
                              <td className="p-3 text-sm text-gray-600">{item.notes || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedRecalibration && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-6 text-white">
              <h3 className="text-xl mb-1">{selectedRecalibration.locationName}</h3>
              <p className="text-purple-100 text-sm">
                {formatDate(selectedRecalibration.date)} • {selectedRecalibration.locationType === 'production_house' ? 'Production House' : 'Store'}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="text-left p-3 text-sm text-gray-700">Item</th>
                      <th className="text-center p-3 text-sm text-gray-700">System Qty</th>
                      <th className="text-center p-3 text-sm text-gray-700">Actual Qty</th>
                      <th className="text-center p-3 text-sm text-gray-700">Difference</th>
                      <th className="text-center p-3 text-sm text-gray-700">Type</th>
                      <th className="text-left p-3 text-sm text-gray-700">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRecalibration.items?.map((item: any, index: number) => (
                      <tr key={index} className="border-b border-gray-200">
                        <td className="p-3 text-sm text-gray-900">
                          {item.itemName}
                          <span className="text-xs text-gray-500 block">{item.category}</span>
                        </td>
                        <td className="p-3 text-sm text-center text-gray-900">
                          {item.systemQuantity} {item.unit}
                        </td>
                        <td className="p-3 text-sm text-center text-gray-900">
                          {item.actualQuantity} {item.unit}
                        </td>
                        <td className={`p-3 text-sm text-center ${
                          item.difference < 0 ? 'text-red-600' : item.difference > 0 ? 'text-green-600' : 'text-gray-600'
                        }`}>
                          {item.difference > 0 ? '+' : ''}{item.difference}
                        </td>
                        <td className="p-3 text-center">
                          {item.adjustmentType ? (
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              item.adjustmentType === 'wastage'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-orange-100 text-orange-700'
                            }`}>
                              {item.adjustmentType === 'wastage' ? 'Wastage' : 'Counting Error'}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="p-3 text-sm text-gray-600">{item.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200">
              <button
                onClick={() => setShowDetailModal(false)}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}