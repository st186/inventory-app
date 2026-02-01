import { useState } from 'react';
import { Download, Upload, Database, AlertCircle, CheckCircle, Loader2, Calendar, HardDrive } from 'lucide-react';
import { AppContext } from '../App';
import { getTodayIST, formatDateTimeIST } from '../utils/timezone';
import * as api from '../utils/api';

type Props = {
  context: AppContext;
};

export function BackupRestore({ context }: Props) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Export all data to JSON
  const handleExportData = async () => {
    setIsExporting(true);
    setExportStatus(null);

    try {
      // Gather all data from context
      const backupData = {
        exportDate: new Date().toISOString(),
        exportDateIST: formatDateTimeIST(new Date().toISOString()),
        version: '1.0',
        data: {
          inventory: context.inventory || [],
          overheads: context.overheads || [],
          fixedCosts: context.fixedCosts || [],
          sales: context.salesData || [],
          categorySalesData: context.categorySalesData || [],
          productionData: context.productionData || [],
          productionHouses: context.productionHouses || [],
          stockRequests: context.stockRequests || [],
          productionRequests: context.productionRequests || [],
          stores: context.stores || [],
          inventoryItems: context.inventoryItems || [],
        },
        metadata: {
          totalInventoryItems: (context.inventory || []).length,
          totalOverheadItems: (context.overheads || []).length,
          totalFixedCostItems: (context.fixedCosts || []).length,
          totalSalesRecords: (context.salesData || []).length,
          totalCategorySalesData: (context.categorySalesData || []).length,
          totalProductionRecords: (context.productionData || []).length,
          totalProductionHouses: (context.productionHouses || []).length,
          totalStockRequests: (context.stockRequests || []).length,
          totalProductionRequests: (context.productionRequests || []).length,
          totalStores: (context.stores || []).length,
          totalInventoryItemTypes: (context.inventoryItems || []).length,
        }
      };

      // Create blob and download
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bhandar-ims-backup-${getTodayIST()}-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportStatus({
        type: 'success',
        message: `Backup created successfully! Downloaded ${Object.values(backupData.metadata).reduce((a, b) => a + b, 0)} total records.`
      });
    } catch (error) {
      console.error('Export error:', error);
      setExportStatus({
        type: 'error',
        message: 'Failed to export data. Please try again.'
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/json') {
        setImportStatus({
          type: 'error',
          message: 'Please select a valid JSON backup file.'
        });
        return;
      }
      setSelectedFile(file);
      setShowImportConfirm(true);
      setImportStatus(null);
    }
  };

  // Import data from JSON backup
  const handleImportData = async () => {
    if (!selectedFile || !context.user) {
      return;
    }

    setIsImporting(true);
    setImportStatus(null);
    setShowImportConfirm(false);

    try {
      // Read file
      const fileContent = await selectedFile.text();
      const backupData = JSON.parse(fileContent);

      // Validate backup structure
      if (!backupData.data || !backupData.version) {
        throw new Error('Invalid backup file format');
      }

      let importedCounts = {
        inventory: 0,
        overheads: 0,
        fixedCosts: 0,
        sales: 0,
        categorySalesData: 0,
        productionData: 0,
        productionHouses: 0,
        stockRequests: 0,
        productionRequests: 0,
        stores: 0,
        inventoryItems: 0,
      };

      // Import inventory items
      if (backupData.data.inventory) {
        for (const item of backupData.data.inventory) {
          try {
            await context.addInventoryItem(item);
            importedCounts.inventory++;
          } catch (error) {
            console.error('Error importing inventory item:', error);
          }
        }
      }

      // Import overhead costs
      if (backupData.data.overheads) {
        for (const item of backupData.data.overheads) {
          try {
            await context.addOverheadItem(item);
            importedCounts.overheads++;
          } catch (error) {
            console.error('Error importing overhead:', error);
          }
        }
      }

      // Import fixed costs
      if (backupData.data.fixedCosts) {
        for (const item of backupData.data.fixedCosts) {
          try {
            await context.addFixedCostItem(item);
            importedCounts.fixedCosts++;
          } catch (error) {
            console.error('Error importing fixed cost:', error);
          }
        }
      }

      // Import sales
      if (backupData.data.sales) {
        for (const item of backupData.data.sales) {
          try {
            await context.addSalesData(item);
            importedCounts.sales++;
          } catch (error) {
            console.error('Error importing sale:', error);
          }
        }
      }

      // Import category sales data
      if (backupData.data.categorySalesData) {
        for (const item of backupData.data.categorySalesData) {
          try {
            await api.addCategorySalesData(context.user.accessToken, item);
            importedCounts.categorySalesData++;
          } catch (error) {
            console.error('Error importing category sales data:', error);
          }
        }
      }

      // Import production data
      if (backupData.data.productionData) {
        for (const item of backupData.data.productionData) {
          try {
            await context.addProductionData(item);
            importedCounts.productionData++;
          } catch (error) {
            console.error('Error importing production data:', error);
          }
        }
      }

      // Import production houses
      if (backupData.data.productionHouses) {
        for (const item of backupData.data.productionHouses) {
          try {
            await context.addProductionHouse(item);
            importedCounts.productionHouses++;
          } catch (error) {
            console.error('Error importing production house:', error);
          }
        }
      }

      // Import stock requests
      if (backupData.data.stockRequests) {
        for (const item of backupData.data.stockRequests) {
          try {
            // Skip if it has fulfillment info - use createStockRequest for base requests only
            const { fulfilledQuantities, status, fulfilledBy, fulfilledByName, fulfillmentDate, notes, ...baseRequest } = item;
            await context.createStockRequest(baseRequest);
            importedCounts.stockRequests++;
          } catch (error) {
            console.error('Error importing stock request:', error);
          }
        }
      }

      // Import production requests - using API directly as context may not have method
      if (backupData.data.productionRequests) {
        for (const item of backupData.data.productionRequests) {
          try {
            await api.createProductionRequest(context.user.accessToken, item);
            importedCounts.productionRequests++;
          } catch (error) {
            console.error('Error importing production request:', error);
          }
        }
      }

      // Import stores - using API directly
      if (backupData.data.stores) {
        for (const item of backupData.data.stores) {
          try {
            await api.createStore(context.user.accessToken, item);
            importedCounts.stores++;
          } catch (error) {
            console.error('Error importing store:', error);
          }
        }
      }

      // Import inventory items - using API directly
      if (backupData.data.inventoryItems) {
        for (const item of backupData.data.inventoryItems) {
          try {
            await api.createInventoryItem(context.user.accessToken, item);
            importedCounts.inventoryItems++;
          } catch (error) {
            console.error('Error importing inventory item type:', error);
          }
        }
      }

      const totalImported = Object.values(importedCounts).reduce((a, b) => a + b, 0);

      setImportStatus({
        type: 'success',
        message: `Successfully imported ${totalImported} records! Page will reload in 3 seconds...`
      });

      // Reload page after 3 seconds to refresh all data
      setTimeout(() => {
        window.location.reload();
      }, 3000);

    } catch (error) {
      console.error('Import error:', error);
      setImportStatus({
        type: 'error',
        message: `Failed to import data: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setIsImporting(false);
      setSelectedFile(null);
    }
  };

  const totalRecords = 
    context.inventory.length +
    context.overheads.length +
    context.fixedCosts.length +
    context.salesData.length +
    context.categorySalesData.length +
    context.productionData.length +
    context.productionHouses.length +
    context.stockRequests.length +
    context.productionRequests.length +
    context.stores.length +
    context.inventoryItems.length;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Database className="w-8 h-8" />
          <h1 className="text-2xl font-bold">Backup & Restore</h1>
        </div>
        <p className="text-purple-100">
          Protect your data by creating regular backups. Export your data to JSON files and restore when needed.
        </p>
      </div>

      {/* Current Database Stats */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">Current Database</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Inventory Items</p>
            <p className="text-2xl font-bold text-blue-600">{context.inventory.length}</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Overhead Costs</p>
            <p className="text-2xl font-bold text-orange-600">{context.overheads.length}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Fixed Costs</p>
            <p className="text-2xl font-bold text-green-600">{context.fixedCosts.length}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Sales Records</p>
            <p className="text-2xl font-bold text-purple-600">{context.salesData.length}</p>
          </div>
          <div className="bg-pink-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Category Sales Data</p>
            <p className="text-2xl font-bold text-pink-600">{context.categorySalesData.length}</p>
          </div>
          <div className="bg-indigo-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Production Data</p>
            <p className="text-2xl font-bold text-indigo-600">{context.productionData.length}</p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Production Houses</p>
            <p className="text-2xl font-bold text-yellow-600">{context.productionHouses.length}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Stock Requests</p>
            <p className="text-2xl font-bold text-red-600">{context.stockRequests.length}</p>
          </div>
          <div className="bg-teal-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Production Requests</p>
            <p className="text-2xl font-bold text-teal-600">{context.productionRequests.length}</p>
          </div>
          <div className="bg-cyan-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Stores</p>
            <p className="text-2xl font-bold text-cyan-600">{context.stores.length}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Inventory Item Types</p>
            <p className="text-2xl font-bold text-gray-600">{context.inventoryItems.length}</p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-lg text-gray-900">
            <span className="font-semibold">Total Records:</span> {totalRecords.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Export Section */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Download className="w-5 h-5 text-green-600" />
          <h2 className="text-xl font-semibold text-gray-900">Export Data (Create Backup)</h2>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">💡 Backup Best Practices:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Create backups daily or after important data entry</li>
                <li>Store backup files in multiple locations (Google Drive, external hard drive, etc.)</li>
                <li>Name files with dates for easy identification</li>
                <li>Test restoring from backups periodically</li>
              </ul>
            </div>
          </div>
        </div>

        <button
          onClick={handleExportData}
          disabled={isExporting || totalRecords === 0}
          className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg font-semibold"
        >
          {isExporting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating Backup...
            </>
          ) : (
            <>
              <Download className="w-5 h-5" />
              Download Backup ({totalRecords} records)
            </>
          )}
        </button>

        {exportStatus && (
          <div className={`mt-4 p-4 rounded-lg flex items-start gap-3 ${
            exportStatus.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}>
            {exportStatus.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <p className={`text-sm ${exportStatus.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
              {exportStatus.message}
            </p>
          </div>
        )}
      </div>

      {/* Import Section */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Upload className="w-5 h-5 text-orange-600" />
          <h2 className="text-xl font-semibold text-gray-900">Import Data (Restore Backup)</h2>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-semibold mb-1">⚠️ Important Warning:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Importing will <strong>ADD</strong> data from the backup file to your current database</li>
                <li>This may create duplicate records if the same data already exists</li>
                <li>Create a backup of your current data before importing</li>
                <li>Only use backup files created by this system</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <input
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            disabled={isImporting}
            className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-orange-400 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          />

          {selectedFile && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Selected file:</p>
              <p className="text-gray-900 font-medium">{selectedFile.name}</p>
              <p className="text-xs text-gray-500 mt-1">
                {(selectedFile.size / 1024).toFixed(2)} KB
              </p>
            </div>
          )}
        </div>

        {importStatus && (
          <div className={`mt-4 p-4 rounded-lg flex items-start gap-3 ${
            importStatus.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}>
            {importStatus.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <p className={`text-sm ${importStatus.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
              {importStatus.message}
            </p>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showImportConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-orange-600" />
              <h3 className="text-xl font-semibold text-gray-900">Confirm Import</h3>
            </div>

            <div className="space-y-3 mb-6">
              <p className="text-gray-700">
                Are you sure you want to import data from this backup file?
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Warning:</strong> This will add all records from the backup file to your current database. Make sure you've created a backup of your current data first!
                </p>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <p className="text-sm text-gray-600 font-medium">{selectedFile?.name}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowImportConfirm(false);
                  setSelectedFile(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImportData}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Additional Tips */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl shadow-lg p-6">
        <div className="flex items-start gap-3">
          <Calendar className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">📅 Recommended Backup Schedule</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-purple-600 font-bold">•</span>
                <span><strong>Daily:</strong> At the end of each business day (especially after sales entry)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 font-bold">•</span>
                <span><strong>Weekly:</strong> Every Sunday for weekly records</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 font-bold">•</span>
                <span><strong>Monthly:</strong> On the last day of each month before monthly reports</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 font-bold">•</span>
                <span><strong>Before Major Changes:</strong> Always backup before bulk edits or deletions</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}