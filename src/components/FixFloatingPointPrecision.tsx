import { useState } from 'react';
import { AlertCircle, RefreshCw, Zap } from 'lucide-react';
import { InventoryContextType } from '../App';
import { projectId } from '../utils/supabase/info';

type Props = {
  context: InventoryContextType;
};

export function FixFloatingPointPrecision({ context }: Props) {
  const [isFixing, setIsFixing] = useState(false);
  const [showButton, setShowButton] = useState(true);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Check if there are ANY items with floating point precision issues
  const itemsWithPrecisionIssues = context.inventory.filter(item => {
    // Check if numbers have more than 2 decimal places or floating point artifacts
    const hasLongDecimals = 
      item.costPerUnit.toString().split('.')[1]?.length > 2 ||
      item.totalCost.toString().split('.')[1]?.length > 2 ||
      item.quantity.toString().split('.')[1]?.length > 2;
    
    // Check for floating point artifacts like 0.0000000000001
    const hasFloatingPointArtifacts =
      item.costPerUnit.toString().includes('e-') ||
      item.totalCost.toString().includes('e-') ||
      item.quantity.toString().includes('e-') ||
      /\d{10,}/.test(item.costPerUnit.toString()) ||
      /\d{10,}/.test(item.totalCost.toString()) ||
      /\d{10,}/.test(item.quantity.toString());
    
    return hasLongDecimals || hasFloatingPointArtifacts;
  });

  // Only show if there are items with precision issues
  if (itemsWithPrecisionIssues.length === 0 || !showButton || !context.user) {
    return null;
  }

  const handleFix = async () => {
    if (!confirm(`🔧 Found ${itemsWithPrecisionIssues.length} inventory items with floating-point precision issues.\n\nThese items have very long decimal values that make them hard to read.\n\n✅ This will round all numbers to 2 decimal places.\n\nContinue?`)) {
      return;
    }

    setIsFixing(true);
    setProgress({ current: 0, total: itemsWithPrecisionIssues.length });

    try {
      const accessToken = context.user?.accessToken;
      if (!accessToken) {
        throw new Error('No access token');
      }

      let successCount = 0;
      let errorCount = 0;

      // Fix each item by rounding the numbers
      for (let i = 0; i < itemsWithPrecisionIssues.length; i++) {
        const item = itemsWithPrecisionIssues[i];
        setProgress({ current: i + 1, total: itemsWithPrecisionIssues.length });

        try {
          // Round all numeric fields to 2 decimal places
          const roundedItem = {
            ...item,
            quantity: Math.round(item.quantity * 100) / 100,
            costPerUnit: Math.round(item.costPerUnit * 100) / 100,
            totalCost: Math.round(item.totalCost * 100) / 100,
          };

          console.log(`Fixing item ${item.id}:`, {
            before: {
              quantity: item.quantity,
              costPerUnit: item.costPerUnit,
              totalCost: item.totalCost,
            },
            after: {
              quantity: roundedItem.quantity,
              costPerUnit: roundedItem.costPerUnit,
              totalCost: roundedItem.totalCost,
            }
          });

          // Update the item via API
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/inventory/${item.id}`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify(roundedItem),
            }
          );

          if (response.ok) {
            successCount++;
          } else {
            errorCount++;
            const errorText = await response.text();
            console.error(`Failed to fix item ${item.id}:`, errorText);
          }
        } catch (error) {
          errorCount++;
          console.error(`Error fixing item ${item.id}:`, error);
        }
      }

      if (successCount > 0) {
        alert(`✅ Successfully fixed ${successCount} inventory items!\n\n${errorCount > 0 ? `⚠️ ${errorCount} items failed to update.\n\n` : ''}Reloading page...`);
        window.location.reload();
      } else {
        alert(`❌ Failed to fix items. Please try again or contact support.`);
      }
    } catch (error) {
      console.error('Error fixing floating point precision:', error);
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsFixing(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 max-w-xl">
      <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-6 py-4 rounded-lg shadow-2xl border-4 border-blue-300">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 animate-pulse" />
          <div className="flex-1">
            <p className="font-bold text-lg">Floating-Point Precision Issue Detected!</p>
            <p className="text-sm text-blue-100">
              {itemsWithPrecisionIssues.length} inventory items have very long decimal values
            </p>
            {isFixing && (
              <div className="mt-2">
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-white h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${(progress.current / progress.total) * 100}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-blue-100 mt-1">
                  Fixing {progress.current} of {progress.total}...
                </p>
              </div>
            )}
          </div>
          <button
            onClick={handleFix}
            disabled={isFixing}
            className="ml-4 bg-white text-blue-600 px-4 py-2 rounded-lg font-bold hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
          >
            {isFixing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Fixing...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Fix Precision Issues
              </>
            )}
          </button>
          {!isFixing && (
            <button
              onClick={() => setShowButton(false)}
              className="ml-2 text-white hover:text-blue-100 font-bold text-xl"
              title="Dismiss"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
