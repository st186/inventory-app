import { useState } from 'react';
import { Bug, Bell } from 'lucide-react';
import * as api from '../utils/api';

type Props = {
  user: any;
  productionData: any[];
};

export function DebugPanel({ user, productionData }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<string | null>(null);
  const [fixingStockRequests, setFixingStockRequests] = useState(false);
  const [stockRequestFixResult, setStockRequestFixResult] = useState<string | null>(null);

  const handleMigrateNotifications = async () => {
    if (!user?.accessToken) return;
    
    setMigrating(true);
    setMigrationResult(null);
    
    try {
      const result = await api.migrateProductionNotifications(user.accessToken);
      setMigrationResult(`✅ ${result.message}`);
      console.log('Migration successful:', result);
    } catch (error) {
      setMigrationResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('Migration failed:', error);
    } finally {
      setMigrating(false);
    }
  };

  const handleFixStockRequests = async () => {
    if (!user?.accessToken) return;
    
    setFixingStockRequests(true);
    setStockRequestFixResult(null);
    
    try {
      const result = await api.fixStockRequests(user.accessToken);
      setStockRequestFixResult(
        `✅ ${result.message}\n\n` +
        `Total Checked: ${result.totalChecked}\n` +
        (result.fixed.length > 0 
          ? `\nFixed Requests:\n${result.fixed.map((f: any) => 
              `  • ${f.storeId}: ${f.oldProductionHouseId} → ${f.newProductionHouseId} (${f.status})`
            ).join('\n')}`
          : '')
      );
      console.log('Stock request fix successful:', result);
    } catch (error) {
      setStockRequestFixResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('Stock request fix failed:', error);
    } finally {
      setFixingStockRequests(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 p-3 bg-purple-600 text-white rounded-full shadow-lg hover:bg-purple-700 z-50"
      >
        <Bug className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white rounded-xl shadow-2xl p-6 max-w-2xl max-h-[80vh] overflow-auto z-50 border-2 border-purple-600">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg text-gray-900">Debug Panel</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm text-gray-700 mb-2">Current User:</h4>
          <pre className="text-xs text-gray-800 overflow-auto">
            {JSON.stringify(user, null, 2)}
          </pre>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm text-gray-700 mb-2">User Role Check:</h4>
          <div className="text-xs space-y-1">
            <p>Role: <strong>{user?.role}</strong></p>
            <p>Designation: <strong>{user?.designation || 'none'}</strong></p>
            <p>Store ID: <strong>{user?.storeId || 'none'}</strong></p>
            <p>Is Operations Manager: <strong>
              {user?.role === 'manager' && 
               user?.designation !== 'store_incharge' && 
               user?.designation !== 'production_incharge' ? 'YES' : 'NO'}
            </strong></p>
            <p>Is Cluster Head: <strong>{user?.role === 'cluster_head' ? 'YES' : 'NO'}</strong></p>
            <p>Is Production Incharge: <strong>{user?.designation === 'production_incharge' ? 'YES' : 'NO'}</strong></p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm text-gray-700 mb-2">Production Data Status:</h4>
          <div className="text-xs space-y-1">
            <p>Total Production Entries: <strong>{productionData.length}</strong></p>
            <p>Pending Approvals: <strong>
              {productionData.filter(p => p.approvalStatus === 'pending').length}
            </strong></p>
            <p>Approved: <strong>
              {productionData.filter(p => p.approvalStatus === 'approved').length}
            </strong></p>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
          <h4 className="text-sm text-gray-700 mb-2">Recent Production Entries:</h4>
          <div className="text-xs space-y-2 max-h-60 overflow-auto">
            {productionData.slice(0, 5).map((prod, i) => (
              <div key={i} className="bg-white p-2 rounded border border-gray-200">
                <p>Date: {prod.date}</p>
                <p>Status: {prod.approvalStatus}</p>
                <p>Created By: {prod.createdBy}</p>
                <p>Store ID: {prod.storeId || 'none'}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
          <h4 className="text-sm text-gray-700 mb-2">Instructions:</h4>
          <ol className="text-xs space-y-1 list-decimal list-inside">
            <li>Check if "Is Operations Manager" shows YES</li>
            <li>Check if you have pending production entries</li>
            <li>Click the button below to create notifications for existing entries</li>
            <li>Or submit NEW production data (after backend changes)</li>
            <li>Check browser console for backend logs</li>
            <li>Check notifications (bell icon)</li>
          </ol>
        </div>

        {/* Migration Button */}
        <div className="bg-green-50 border border-green-300 rounded-lg p-4">
          <h4 className="text-sm text-gray-700 mb-2">Create Notifications for Existing Entries:</h4>
          <button
            onClick={handleMigrateNotifications}
            disabled={migrating}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Bell className="w-4 h-4" />
            {migrating ? 'Creating Notifications...' : 'Create Notifications Now'}
          </button>
          {migrationResult && (
            <div className="mt-3 p-3 bg-white rounded border border-gray-300 text-xs">
              {migrationResult}
            </div>
          )}
          <p className="text-xs text-gray-600 mt-2">
            This will create notifications for all {productionData.filter(p => p.approvalStatus === 'pending').length} pending production entries.
          </p>
        </div>

        {/* Fix Stock Requests Button */}
        <div className="bg-orange-50 border border-orange-300 rounded-lg p-4">
          <h4 className="text-sm text-gray-700 mb-2">Fix Stock Request Production House Mapping:</h4>
          <button
            onClick={handleFixStockRequests}
            disabled={fixingStockRequests}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Bug className="w-4 h-4" />
            {fixingStockRequests ? 'Fixing Stock Requests...' : 'Fix Stock Requests Now'}
          </button>
          {stockRequestFixResult && (
            <div className="mt-3 p-3 bg-white rounded border border-gray-300 text-xs whitespace-pre-wrap font-mono">
              {stockRequestFixResult}
            </div>
          )}
          <p className="text-xs text-gray-600 mt-2">
            This will ensure all stock requests have the correct productionHouseId based on store mapping.
          </p>
        </div>
      </div>
    </div>
  );
}
