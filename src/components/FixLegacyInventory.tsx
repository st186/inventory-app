import { useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { InventoryContextType } from '../App';
import { projectId, publicAnonKey } from '../utils/supabase/info';

type Props = {
  context: InventoryContextType;
};

export function FixLegacyInventory({ context }: Props) {
  const [isFixing, setIsFixing] = useState(false);
  const [showButton, setShowButton] = useState(true);

  // Check if there are ANY legacy items (items without storeId)
  const legacyItems = context.inventory.filter(
    item => !item.storeId
  );

  // Only show if user has a storeId and there are legacy items
  if (!context.user?.storeId || legacyItems.length === 0 || !showButton) {
    return null;
  }

  const handleFix = async () => {
    const dates = [...new Set(legacyItems.map(i => i.date))].sort();
    if (!confirm(`Found ${legacyItems.length} inventory items without a store assignment.\n\nDates: ${dates.join(', ')}\n\nAssign them ALL to your current store (${context.user?.storeId})?`)) {
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

      // Update each legacy item with the current user's storeId
      for (const item of legacyItems) {
        try {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/inventory/${item.id}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                ...item,
                storeId: context.user?.storeId,
              }),
            }
          );

          if (response.ok) {
            successCount++;
          } else {
            errorCount++;
            console.error(`Failed to update item ${item.id}:`, await response.text());
          }
        } catch (error) {
          errorCount++;
          console.error(`Error updating item ${item.id}:`, error);
        }
      }

      if (successCount > 0) {
        alert(`✅ Successfully assigned ${successCount} inventory items to your store!\n\nReloading page...`);
        window.location.reload();
      } else {
        alert(`❌ Failed to update items. Please try again or contact support.`);
      }
    } catch (error) {
      console.error('Error fixing legacy inventory:', error);
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-bounce">
      <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-6 py-4 rounded-lg shadow-2xl border-4 border-yellow-300">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 animate-pulse" />
          <div>
            <p className="font-bold text-lg">Legacy Data Found!</p>
            <p className="text-sm text-yellow-100">
              {legacyItems.length} inventory items need store assignment
            </p>
          </div>
          <button
            onClick={handleFix}
            disabled={isFixing}
            className="ml-4 bg-white text-orange-600 px-4 py-2 rounded-lg font-bold hover:bg-yellow-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isFixing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Fixing...
              </>
            ) : (
              'Fix Now'
            )}
          </button>
          <button
            onClick={() => setShowButton(false)}
            className="ml-2 text-yellow-100 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
