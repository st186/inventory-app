import { useState } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { InventoryContextType } from '../App';
import { projectId, publicAnonKey } from '../utils/supabase/info';

type Props = {
  context: InventoryContextType;
};

export function FixMissingItemNames({ context }: Props) {
  const [isFixing, setIsFixing] = useState(false);
  const [showButton, setShowButton] = useState(true);

  // Check if there are ANY items with missing itemName
  const itemsWithMissingNames = context.inventory.filter(
    item => !item.itemName || item.itemName.trim() === ''
  );

  // Only show if there are items with missing names
  if (itemsWithMissingNames.length === 0 || !showButton || !context.user) {
    return null;
  }

  const handleFix = async () => {
    if (!confirm(`⚠️ Found ${itemsWithMissingNames.length} inventory items with missing names.\\n\\nThese items cannot be properly displayed or tracked.\\n\\n❌ These items will be DELETED because they have no name to identify them.\\n\\nContinue?`)) {
      return;
    }

    setIsFixing(true);
    try {
      const accessToken = context.user?.accessToken;
      if (!accessToken) {
        throw new Error('No access token');
      }

      let successCount = 0;
      let errorCount = 0;

      // Delete each item with missing name
      for (const item of itemsWithMissingNames) {
        try {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/inventory/${item.id}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );

          if (response.ok) {
            successCount++;
          } else {
            errorCount++;
            console.error(`Failed to delete item ${item.id}:`, await response.text());
          }
        } catch (error) {
          errorCount++;
          console.error(`Error deleting item ${item.id}:`, error);
        }
      }

      if (successCount > 0) {
        alert(`✅ Successfully removed ${successCount} invalid inventory items!\\n\\nReloading page...`);
        window.location.reload();
      } else {
        alert(`❌ Failed to clean up items. Please try again or contact support.`);
      }
    } catch (error) {
      console.error('Error fixing missing item names:', error);
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="fixed top-32 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-gradient-to-r from-red-500 to-pink-500 text-white px-6 py-4 rounded-lg shadow-2xl border-4 border-red-300">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 animate-pulse" />
          <div>
            <p className="font-bold text-lg">Invalid Data Detected!</p>
            <p className="text-sm text-red-100">
              {itemsWithMissingNames.length} inventory items have missing names
            </p>
          </div>
          <button
            onClick={handleFix}
            disabled={isFixing}
            className="ml-4 bg-white text-red-600 px-4 py-2 rounded-lg font-bold hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isFixing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Cleaning...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Clean Up Invalid Items
              </>
            )}
          </button>
          <button
            onClick={() => setShowButton(false)}
            className="ml-2 text-white hover:text-red-100 font-bold text-xl"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}