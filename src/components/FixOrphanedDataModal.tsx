import { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import * as api from '../utils/api';
import { toast } from 'sonner@2.0.3';

interface FixOrphanedDataModalProps {
  onClose: () => void;
  onSuccess: () => void;
  accessToken: string;
  stores: api.Store[];
}

export function FixOrphanedDataModal({ onClose, onSuccess, accessToken, stores }: FixOrphanedDataModalProps) {
  const [targetStoreId, setTargetStoreId] = useState('');
  const [isFixing, setIsFixing] = useState(false);

  const handleFix = async () => {
    if (!targetStoreId) {
      toast.error('Please select a target store');
      return;
    }

    setIsFixing(true);
    try {
      const result = await api.fixOrphanedStoreData(accessToken, targetStoreId);
      
      toast.success(`Fixed ${result.fixedCount} orphaned records!`, {
        description: `All records with null storeId have been assigned to the selected store.`
      });
      
      console.log('🔧 Fixed orphaned data:', result.fixed);
      
      onSuccess();
    } catch (error) {
      console.error('Error fixing orphaned data:', error);
      toast.error('Failed to fix orphaned data. Please try again.');
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <h2 className="text-xl text-gray-900">Fix Orphaned Data</h2>
          </div>
          <p className="text-sm text-gray-600 ml-13">
            Some sales, inventory, or overhead records have missing store IDs (null). 
            This tool will assign them to the store you select below.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Target Store <span className="text-red-500">*</span>
            </label>
            <select
              value={targetStoreId}
              onChange={(e) => setTargetStoreId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={isFixing}
            >
              <option value="">Select a store</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name} - {store.location}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>What this does:</strong> All sales, inventory, and overhead records 
              with <code className="bg-blue-100 px-1 rounded">storeId: null</code> will be 
              updated to belong to the selected store.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={isFixing}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleFix}
              disabled={isFixing || !targetStoreId}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isFixing ? 'Fixing...' : 'Fix Orphaned Data'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
