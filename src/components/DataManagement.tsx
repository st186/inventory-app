import { useState } from 'react';
import { Trash2, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import * as api from '../utils/api';

interface DataManagementProps {
  accessToken: string;
  onDataCleared: () => void;
}

export function DataManagement({ accessToken, onDataCleared }: DataManagementProps) {
  const [clearInventory, setClearInventory] = useState(false);
  const [clearOverheads, setClearOverheads] = useState(false);
  const [clearSales, setClearSales] = useState(false);
  const [clearTimesheets, setClearTimesheets] = useState(false);
  const [clearLeaves, setClearLeaves] = useState(false);
  const [clearItemSales, setClearItemSales] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; clearedTypes: string[] } | null>(null);
  const [cleanupResult, setCleanupResult] = useState<{ success: boolean; message: string; deletedCount: any } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClearData = async () => {
    // Check if at least one option is selected
    if (!clearInventory && !clearOverheads && !clearSales && !clearTimesheets && !clearLeaves && !clearItemSales) {
      setError('Please select at least one data type to clear');
      return;
    }

    // Confirm action
    const selectedTypes = [
      clearInventory && 'Inventory',
      clearOverheads && 'Overheads',
      clearSales && 'Sales',
      clearTimesheets && 'Timesheets',
      clearLeaves && 'Leaves',
      clearItemSales && 'Item Sales'
    ].filter(Boolean).join(', ');

    if (!confirm(`⚠️ WARNING: This will permanently delete all ${selectedTypes} data. This action cannot be undone. Are you absolutely sure?`)) {
      return;
    }

    setIsClearing(true);
    setError(null);
    setResult(null);

    try {
      const response = await api.clearSelectiveData(accessToken, {
        clearInventory,
        clearOverheads,
        clearSales,
        clearTimesheets,
        clearLeaves,
        clearItemSales
      });
      
      setResult(response);
      
      // Reset checkboxes
      setClearInventory(false);
      setClearOverheads(false);
      setClearSales(false);
      setClearTimesheets(false);
      setClearLeaves(false);
      setClearItemSales(false);

      // Notify parent to reload data
      onDataCleared();
    } catch (err: any) {
      setError(err.message || 'Failed to clear data');
    } finally {
      setIsClearing(false);
    }
  };

  const handleCleanDuplicates = async () => {
    if (!confirm('⚠️ This will remove duplicate entries created by data migration. This is safe but irreversible. Continue?')) {
      return;
    }

    setIsCleaningDuplicates(true);
    setError(null);
    setCleanupResult(null);

    try {
      const response = await api.cleanDuplicates(accessToken);
      
      setCleanupResult(response);
      
      // Reload data after cleanup
      onDataCleared();
    } catch (err: any) {
      setError(err.message || 'Failed to clean duplicates');
    } finally {
      setIsCleaningDuplicates(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-red-100 rounded-lg">
            <Trash2 className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h2 className="text-xl text-gray-900">Data Management</h2>
            <p className="text-sm text-gray-600">Selectively clear data from the system</p>
          </div>
        </div>

        {/* Warning Banner */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="text-sm text-yellow-900 mb-1">Important Warning</h3>
              <p className="text-xs text-yellow-800">
                This action will permanently delete the selected data types. Employee records and Payroll/Payout data will NOT be affected.
                This operation cannot be undone.
              </p>
            </div>
          </div>
        </div>

        {/* Data Type Selection */}
        <div className="space-y-4 mb-6">
          <h3 className="text-sm text-gray-700">Select data types to clear:</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-red-300 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={clearInventory}
                onChange={(e) => setClearInventory(e.target.checked)}
                className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
              />
              <div>
                <div className="text-sm text-gray-900">Inventory Data</div>
                <div className="text-xs text-gray-500">All inventory items and costs</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-red-300 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={clearOverheads}
                onChange={(e) => setClearOverheads(e.target.checked)}
                className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
              />
              <div>
                <div className="text-sm text-gray-900">Overhead Expenses</div>
                <div className="text-xs text-gray-500">Fuel, travel, marketing, etc.</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-red-300 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={clearSales}
                onChange={(e) => setClearSales(e.target.checked)}
                className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
              />
              <div>
                <div className="text-sm text-gray-900">Sales Data</div>
                <div className="text-xs text-gray-500">All sales transactions</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-red-300 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={clearTimesheets}
                onChange={(e) => setClearTimesheets(e.target.checked)}
                className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
              />
              <div>
                <div className="text-sm text-gray-900">Timesheets</div>
                <div className="text-xs text-gray-500">Employee attendance records</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-red-300 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={clearLeaves}
                onChange={(e) => setClearLeaves(e.target.checked)}
                className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
              />
              <div>
                <div className="text-sm text-gray-900">Leave Applications</div>
                <div className="text-xs text-gray-500">All leave requests</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-red-300 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={clearItemSales}
                onChange={(e) => setClearItemSales(e.target.checked)}
                className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
              />
              <div>
                <div className="text-sm text-gray-900">Item Sales Data</div>
                <div className="text-xs text-gray-500">Product-wise sales records</div>
              </div>
            </label>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="w-4 h-4" />
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Success Message */}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-2 text-green-800">
              <CheckCircle className="w-5 h-5 mt-0.5" />
              <div>
                <p className="text-sm mb-1">{result.message}</p>
                <p className="text-xs text-green-700">Cleared: {result.clearedTypes.join(', ')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Cleanup Success Message */}
        {cleanupResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-2 text-green-800">
              <CheckCircle className="w-5 h-5 mt-0.5" />
              <div>
                <p className="text-sm mb-1">{cleanupResult.message}</p>
                {cleanupResult.deletedCount && (
                  <div className="text-xs text-green-700">
                    <div>Sales: {cleanupResult.deletedCount.sales || 0} duplicates removed</div>
                    <div>Inventory: {cleanupResult.deletedCount.inventory || 0} duplicates removed</div>
                    <div>Overheads: {cleanupResult.deletedCount.overheads || 0} duplicates removed</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-between items-center">
          <div className="text-xs text-gray-500">
            Employee records and Payroll data will be preserved
          </div>
          <button
            onClick={handleClearData}
            disabled={isClearing}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isClearing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Clearing...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Clear Selected Data
              </>
            )}
          </button>
        </div>

        {/* Cleanup Button */}
        <div className="flex justify-between items-center mt-4">
          <div className="text-xs text-gray-500">
            Remove duplicate entries from the system
          </div>
          <button
            onClick={handleCleanDuplicates}
            disabled={isCleaningDuplicates}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isCleaningDuplicates ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Cleaning...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Clean Duplicates
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}