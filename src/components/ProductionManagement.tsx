import { useState, useMemo, useEffect } from 'react';
import { InventoryContextType, ProductionData } from '../App';
import { Factory, ChefHat, Soup, Trash2, CheckCircle, AlertTriangle, CheckSquare, Eraser } from 'lucide-react';
import { DateSelector } from './DateSelector';
import * as api from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { logger } from '../utils/logger';

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
};

export function ProductionManagement({ context, selectedStoreId }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [activeTab, setActiveTab] = useState<'entry' | 'approvals'>('entry');
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const isProductionIncharge = context.user?.designation === 'production_incharge';
  const isOperationsManager = context.user?.role === 'manager' && context.user?.designation !== 'store_incharge' && context.user?.designation !== 'production_incharge';
  const isClusterHead = context.user?.role === 'cluster_head';
  const canEdit = isProductionIncharge;
  const canApprove = isOperationsManager; // Only Operations Managers can approve (Cluster Heads can only view)
  const canViewApprovals = isOperationsManager || isClusterHead; // Both can view approvals tab

  // Get production data for selected date (filtered by selected store, not user's store)
  const productionForDate = useMemo(() => {
    // Use selectedStoreId prop (from store selector) instead of user's storeId
    // This allows cluster heads to view data for any selected store
    const effectiveStoreId = selectedStoreId || context.user?.storeId;
    logger.debugProduction('ProductionManagement - effectiveStoreId:', effectiveStoreId);
    logger.debugProduction('ProductionManagement - selectedStoreId prop:', selectedStoreId);
    logger.debugProduction('ProductionManagement - user storeId:', context.user?.storeId);
    const filteredProduction = effectiveStoreId 
      ? context.productionData.filter(p => p.storeId === effectiveStoreId)
      : context.productionData;
    logger.debugProduction('ProductionManagement - filtered production count:', filteredProduction.length);
    return filteredProduction.find(p => p.date === selectedDate);
  }, [context.productionData, selectedDate, selectedStoreId, context.user?.storeId]);

  // Initialize form data
  const [formData, setFormData] = useState<Omit<ProductionData, 'id' | 'createdBy' | 'approvalStatus' | 'approvedBy' | 'approvedAt' | 'storeId'>>({
    date: selectedDate,
    chickenMomos: { dough: 0, stuffing: 0, final: 0 },
    chickenCheeseMomos: { dough: 0, stuffing: 0, final: 0 },
    vegMomos: { dough: 0, stuffing: 0, final: 0 },
    cheeseCornMomos: { dough: 0, stuffing: 0, final: 0 },
    paneerMomos: { dough: 0, stuffing: 0, final: 0 },
    vegKurkureMomos: { batter: 0, coating: 0, final: 0 },
    chickenKurkureMomos: { batter: 0, coating: 0, final: 0 },
    wastage: { dough: 0, stuffing: 0, batter: 0, coating: 0 },
    sauces: {
      panfriedSauce: 0,
      chilliChickenSauce: 0,
      spicyKoreanSauce: 0,
      hotGarlicSauce: 0,
      tandooriSauce: 0,
      soupPremix: 0,
      greenMayoChutney: 0,
      spicyRedChutney: 0,
    }
  });

  // Load existing data when date changes
  useEffect(() => {
    if (productionForDate) {
      setFormData({
        date: productionForDate.date,
        chickenMomos: productionForDate.chickenMomos,
        chickenCheeseMomos: productionForDate.chickenCheeseMomos,
        vegMomos: productionForDate.vegMomos,
        cheeseCornMomos: productionForDate.cheeseCornMomos,
        paneerMomos: productionForDate.paneerMomos,
        vegKurkureMomos: productionForDate.vegKurkureMomos,
        chickenKurkureMomos: productionForDate.chickenKurkureMomos,
        wastage: productionForDate.wastage,
        sauces: productionForDate.sauces,
      });
    } else {
      setFormData({
        date: selectedDate,
        chickenMomos: { dough: 0, stuffing: 0, final: 0 },
        chickenCheeseMomos: { dough: 0, stuffing: 0, final: 0 },
        vegMomos: { dough: 0, stuffing: 0, final: 0 },
        cheeseCornMomos: { dough: 0, stuffing: 0, final: 0 },
        paneerMomos: { dough: 0, stuffing: 0, final: 0 },
        vegKurkureMomos: { batter: 0, coating: 0, final: 0 },
        chickenKurkureMomos: { batter: 0, coating: 0, final: 0 },
        wastage: { dough: 0, stuffing: 0, batter: 0, coating: 0 },
        sauces: {
          panfriedSauce: 0,
          chilliChickenSauce: 0,
          spicyKoreanSauce: 0,
          hotGarlicSauce: 0,
          tandooriSauce: 0,
          soupPremix: 0,
          greenMayoChutney: 0,
          spicyRedChutney: 0,
        }
      });
    }
  }, [selectedDate, productionForDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent duplicate submissions
    if (submitting) {
      logger.warn('Submission already in progress, ignoring duplicate request');
      return;
    }

    const productionData: Omit<ProductionData, 'id'> = {
      ...formData,
      date: selectedDate,
      createdBy: context.user?.employeeId || context.user?.email || 'unknown',
      approvalStatus: 'pending',
      approvedBy: null,
      approvedAt: null,
      storeId: context.user?.storeId || undefined,
      productionHouseId: context.user?.storeId || undefined // Production heads' storeId is actually their production house ID
    };
    
    console.log('🏭 Saving Production Data:');
    console.log('  - User storeId:', context.user?.storeId);
    console.log('  - Production data storeId:', productionData.storeId);
    console.log('  - Production data productionHouseId:', productionData.productionHouseId);
    console.log('  - Full production data:', productionData);

    try {
      setSubmitting(true);
      if (productionForDate) {
        await context.updateProductionData(productionForDate.id, productionData);
        alert('Production data updated successfully!');
      } else {
        await context.addProductionData(productionData);
        alert('Production data saved successfully!');
      }
    } catch (error) {
      console.error('Error saving production data:', error);
      alert('Failed to save production data. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!productionForDate) return;
    
    // Prevent duplicate approvals
    if (approving) {
      console.log('⚠️ Approval already in progress, ignoring duplicate request');
      return;
    }
    
    try {
      setApproving(true);
      await context.approveProductionData(productionForDate.id);
      
      // Update production house inventory after approval
      const userProductionHouse = context.productionHouses.find(
        h => h.productionHeadId === context.user?.employeeId
      );
      
      if (userProductionHouse && productionForDate) {
        const newInventory = { ...userProductionHouse.inventory };
        
        // Dynamically add final production quantities to inventory
        // Support both old hardcoded fields and new dynamic structure
        const productionObj = productionForDate as any;
        
        // Old hardcoded format mapping
        const oldFieldMapping: Record<string, string> = {
          'chickenMomos': 'chicken',
          'chickenCheeseMomos': 'chickenCheese',
          'vegMomos': 'veg',
          'cheeseCornMomos': 'cheeseCorn',
          'paneerMomos': 'paneer',
          'vegKurkureMomos': 'vegKurkure',
          'chickenKurkureMomos': 'chickenKurkure'
        };
        
        // Process old format
        Object.entries(oldFieldMapping).forEach(([oldKey, inventoryKey]) => {
          const finalQty = productionObj[oldKey]?.final || 0;
          if (finalQty > 0) {
            newInventory[inventoryKey] = (newInventory[inventoryKey] || 0) + finalQty;
            console.log(`  📦 Added ${finalQty} ${inventoryKey} from ${oldKey}`);
          }
        });
        
        // Process new dynamic format (if it exists in future)
        if (productionObj.items) {
          Object.entries(productionObj.items).forEach(([itemKey, itemData]: [string, any]) => {
            const finalQty = itemData?.final || 0;
            if (finalQty > 0) {
              newInventory[itemKey] = (newInventory[itemKey] || 0) + finalQty;
              console.log(`  📦 Added ${finalQty} ${itemKey} from dynamic items`);
            }
          });
        }
        
        await context.updateProductionHouseInventory(userProductionHouse.id, newInventory);
        console.log('✅ Production house inventory updated after approval:', newInventory);
      }
      
      alert('Production data approved successfully! Inventory updated.');
    } catch (error) {
      console.error('Error approving production:', error);
      alert('Failed to approve production data. Please try again.');
    } finally {
      setApproving(false);
    }
  };

  const handleCleanupDuplicates = async () => {
    if (!confirm('This will remove duplicate pending production entries, keeping only the original entry for each date. Continue?')) {
      return;
    }

    setCleaning(true);
    try {
      const result = await api.cleanupDuplicateProduction();
      
      if (result.success) {
        toast.success(result.message);
        
        // Show details if any duplicates were found
        if (result.duplicatesFound > 0) {
          console.log('🧹 Cleanup Details:', result.details);
          
          // Automatically reload the page to refresh data
          toast.info('Refreshing data...', { duration: 2000 });
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else {
          toast.info('No duplicate entries found!');
          setCleaning(false);
        }
      }
    } catch (error) {
      console.error('Error cleaning up duplicates:', error);
      toast.error('Failed to clean up duplicates. Please try again.');
      setCleaning(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl text-gray-900 flex items-center gap-3">
            <Factory className="w-8 h-8 text-orange-600" />
            Production Management
          </h1>
          <p className="text-gray-600 mt-2">Log daily production data for momos, sauces, and track wastage</p>
        </div>
        
        {/* Cleanup button for Cluster Heads */}
        {isClusterHead && activeTab === 'approvals' && (
          <button
            onClick={handleCleanupDuplicates}
            disabled={cleaning}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
          >
            <Eraser className="w-4 h-4" />
            {cleaning ? 'Cleaning...' : 'Clean Duplicates'}
          </button>
        )}
      </div>

      {/* Tab Navigation for Operations Managers/Cluster Heads */}
      {canViewApprovals && (
        <div className="bg-white rounded-xl shadow-sm p-1 mb-6 flex gap-2">
          <button
            onClick={() => setActiveTab('entry')}
            className={`flex-1 px-6 py-3 rounded-lg transition-all ${
              activeTab === 'entry'
                ? 'bg-orange-600 text-white shadow-lg'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Production Entry
          </button>
          <button
            onClick={() => setActiveTab('approvals')}
            className={`flex-1 px-6 py-3 rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'approvals'
                ? 'bg-orange-600 text-white shadow-lg'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Pending Approvals
            {(() => {
              const pendingCount = context.productionData.filter(p => 
                p.approvalStatus === 'pending' && 
                (!context.user?.storeId || p.storeId === context.user.storeId)
              ).length;
              return pendingCount > 0 && (
                <span className={`px-2 py-1 rounded-full text-xs ${
                  activeTab === 'approvals' ? 'bg-white text-orange-600' : 'bg-orange-600 text-white'
                }`}>
                  {pendingCount}
                </span>
              );
            })()}
          </button>
        </div>
      )}

      {/* Pending Approvals View */}
      {activeTab === 'approvals' && canViewApprovals && (
        <div className="space-y-4">
          {(() => {
            const pendingProduction = context.productionData
              .filter(p => 
                p.approvalStatus === 'pending' && 
                (!context.user?.storeId || p.storeId === context.user.storeId)
              )
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            if (pendingProduction.length === 0) {
              return (
                <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                  <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
                  <h3 className="text-xl text-gray-900 mb-2">All Caught Up!</h3>
                  <p className="text-gray-600">No pending production approvals at this time.</p>
                </div>
              );
            }

            return pendingProduction.map((production) => {
              const totalProduction = 
                production.chickenMomos.final +
                production.chickenCheeseMomos.final +
                production.vegMomos.final +
                production.cheeseCornMomos.final +
                production.paneerMomos.final +
                production.vegKurkureMomos.final +
                production.chickenKurkureMomos.final;

              const totalWastage =
                production.wastage.dough +
                production.wastage.stuffing +
                production.wastage.batter +
                production.wastage.coating;

              return (
                <div key={production.id} className="bg-white rounded-xl shadow-lg p-6 border-2 border-yellow-300">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5 text-yellow-600" />
                        <h3 className="text-xl text-gray-900">
                          {new Date(production.date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </h3>
                      </div>
                      <p className="text-sm text-gray-600">Submitted by: {production.createdBy}</p>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await context.approveProductionData(production.id);
                          alert('Production data approved successfully!');
                        } catch (error) {
                          alert('Failed to approve production data. Please try again.');
                        }
                      }}
                      className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                    >
                      <CheckSquare className="w-5 h-5" />
                      Approve
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4">
                      <p className="text-sm text-gray-600 mb-1">Total Production</p>
                      <p className="text-2xl text-gray-900">{totalProduction} pcs</p>
                    </div>
                    <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4">
                      <p className="text-sm text-gray-600 mb-1">Total Wastage</p>
                      <p className="text-2xl text-gray-900">{totalWastage.toFixed(2)} kg</p>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
                      <p className="text-sm text-gray-600 mb-1">Kurkure Production</p>
                      <p className="text-2xl text-gray-900">
                        {production.vegKurkureMomos.final + production.chickenKurkureMomos.final} pcs
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
                      <p className="text-sm text-gray-600 mb-1">Regular Momos</p>
                      <p className="text-2xl text-gray-900">
                        {production.chickenMomos.final +
                          production.chickenCheeseMomos.final +
                          production.vegMomos.final +
                          production.cheeseCornMomos.final +
                          production.paneerMomos.final}{' '}
                        pcs
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="text-sm text-gray-700 mb-3">Production Breakdown:</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
                      {production.chickenMomos.final > 0 && (
                        <div className="bg-red-50 p-2 rounded">
                          <p className="text-gray-600">Chicken</p>
                          <p className="text-gray-900">{production.chickenMomos.final} pcs</p>
                        </div>
                      )}
                      {production.chickenCheeseMomos.final > 0 && (
                        <div className="bg-yellow-50 p-2 rounded">
                          <p className="text-gray-600">Chk Cheese</p>
                          <p className="text-gray-900">{production.chickenCheeseMomos.final} pcs</p>
                        </div>
                      )}
                      {production.vegMomos.final > 0 && (
                        <div className="bg-green-50 p-2 rounded">
                          <p className="text-gray-600">Veg</p>
                          <p className="text-gray-900">{production.vegMomos.final} pcs</p>
                        </div>
                      )}
                      {production.cheeseCornMomos.final > 0 && (
                        <div className="bg-amber-50 p-2 rounded">
                          <p className="text-gray-600">Cheese Corn</p>
                          <p className="text-gray-900">{production.cheeseCornMomos.final} pcs</p>
                        </div>
                      )}
                      {production.paneerMomos.final > 0 && (
                        <div className="bg-blue-50 p-2 rounded">
                          <p className="text-gray-600">Paneer</p>
                          <p className="text-gray-900">{production.paneerMomos.final} pcs</p>
                        </div>
                      )}
                      {production.vegKurkureMomos.final > 0 && (
                        <div className="bg-lime-50 p-2 rounded">
                          <p className="text-gray-600">Veg Kurkure</p>
                          <p className="text-gray-900">{production.vegKurkureMomos.final} pcs</p>
                        </div>
                      )}
                      {production.chickenKurkureMomos.final > 0 && (
                        <div className="bg-orange-50 p-2 rounded">
                          <p className="text-gray-600">Chk Kurkure</p>
                          <p className="text-gray-900">{production.chickenKurkureMomos.final} pcs</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* Production Entry View */}
      {activeTab === 'entry' && (
        <>
      {/* Date Selector */}
      <DateSelector selectedDate={selectedDate} onDateChange={setSelectedDate} />

      {/* Approval Status Banner */}
      {productionForDate && productionForDate.approvalStatus === 'pending' && (
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            <p className="text-gray-900">
              Production data for {new Date(selectedDate).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })} is awaiting approval from Operations Manager.
            </p>
          </div>
        </div>
      )}

      {productionForDate && productionForDate.approvalStatus === 'approved' && (
        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="text-gray-900">
              ✓ Production data approved by {productionForDate.approvedBy}
            </p>
          </div>
        </div>
      )}

      {/* Operations Manager Approval Section */}
      {canApprove && productionForDate && productionForDate.approvalStatus === 'pending' && (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-6 mb-6">
          <h2 className="text-gray-900 mb-4 flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-blue-600" />
            Approval Required
          </h2>
          <p className="text-gray-700 mb-4">
            Production data submitted by {productionForDate.createdBy} is awaiting your approval.
          </p>
          <button
            onClick={handleApprove}
            disabled={approving}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckSquare className="w-5 h-5" />
            {approving ? 'Approving...' : 'Approve Production Data'}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Regular Momos Section */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-gray-900 mb-6 flex items-center gap-2">
            <ChefHat className="w-6 h-6 text-orange-600" />
            Regular Momos (Dough + Stuffing)
          </h2>

          <div className="space-y-6">
            {/* Chicken Momos */}
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4">
              <h3 className="text-gray-900 mb-4 font-semibold">Chicken Momos</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Dough (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.chickenMomos.dough}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenMomos: { ...formData.chickenMomos, dough: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Stuffing (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.chickenMomos.stuffing}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenMomos: { ...formData.chickenMomos, stuffing: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Final Momos (pcs)</label>
                  <input
                    type="number"
                    value={formData.chickenMomos.final}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenMomos: { ...formData.chickenMomos, final: parseInt(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>

            {/* Chicken Cheese Momos */}
            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4">
              <h3 className="text-gray-900 mb-4 font-semibold">Chicken Cheese Momos</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Dough (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.chickenCheeseMomos.dough}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenCheeseMomos: { ...formData.chickenCheeseMomos, dough: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Stuffing (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.chickenCheeseMomos.stuffing}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenCheeseMomos: { ...formData.chickenCheeseMomos, stuffing: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Final Momos (pcs)</label>
                  <input
                    type="number"
                    value={formData.chickenCheeseMomos.final}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenCheeseMomos: { ...formData.chickenCheeseMomos, final: parseInt(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>

            {/* Veg Momos */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
              <h3 className="text-gray-900 mb-4 font-semibold">Veg Momos</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Dough (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.vegMomos.dough}
                    onChange={(e) => setFormData({
                      ...formData,
                      vegMomos: { ...formData.vegMomos, dough: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Stuffing (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.vegMomos.stuffing}
                    onChange={(e) => setFormData({
                      ...formData,
                      vegMomos: { ...formData.vegMomos, stuffing: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Final Momos (pcs)</label>
                  <input
                    type="number"
                    value={formData.vegMomos.final}
                    onChange={(e) => setFormData({
                      ...formData,
                      vegMomos: { ...formData.vegMomos, final: parseInt(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>

            {/* Cheese Corn Momos */}
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4">
              <h3 className="text-gray-900 mb-4 font-semibold">Cheese Corn Momos</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Dough (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cheeseCornMomos.dough}
                    onChange={(e) => setFormData({
                      ...formData,
                      cheeseCornMomos: { ...formData.cheeseCornMomos, dough: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Stuffing (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cheeseCornMomos.stuffing}
                    onChange={(e) => setFormData({
                      ...formData,
                      cheeseCornMomos: { ...formData.cheeseCornMomos, stuffing: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Final Momos (pcs)</label>
                  <input
                    type="number"
                    value={formData.cheeseCornMomos.final}
                    onChange={(e) => setFormData({
                      ...formData,
                      cheeseCornMomos: { ...formData.cheeseCornMomos, final: parseInt(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>

            {/* Paneer Momos */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
              <h3 className="text-gray-900 mb-4 font-semibold">Paneer Momos</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Dough (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.paneerMomos.dough}
                    onChange={(e) => setFormData({
                      ...formData,
                      paneerMomos: { ...formData.paneerMomos, dough: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Stuffing (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.paneerMomos.stuffing}
                    onChange={(e) => setFormData({
                      ...formData,
                      paneerMomos: { ...formData.paneerMomos, stuffing: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Final Momos (pcs)</label>
                  <input
                    type="number"
                    value={formData.paneerMomos.final}
                    onChange={(e) => setFormData({
                      ...formData,
                      paneerMomos: { ...formData.paneerMomos, final: parseInt(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Kurkure Momos Section */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-gray-900 mb-6 flex items-center gap-2">
            <Factory className="w-6 h-6 text-purple-600" />
            Kurkure Momos (Batter + Coating)
          </h2>

          <div className="space-y-6">
            {/* Veg Kurkure Momos */}
            <div className="bg-gradient-to-br from-lime-50 to-lime-100 rounded-lg p-4">
              <h3 className="text-gray-900 mb-4 font-semibold">Veg Kurkure Momos</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Batter (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.vegKurkureMomos.batter}
                    onChange={(e) => setFormData({
                      ...formData,
                      vegKurkureMomos: { ...formData.vegKurkureMomos, batter: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Coating Mix (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.vegKurkureMomos.coating}
                    onChange={(e) => setFormData({
                      ...formData,
                      vegKurkureMomos: { ...formData.vegKurkureMomos, coating: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Final Kurkure (pcs)</label>
                  <input
                    type="number"
                    value={formData.vegKurkureMomos.final}
                    onChange={(e) => setFormData({
                      ...formData,
                      vegKurkureMomos: { ...formData.vegKurkureMomos, final: parseInt(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>

            {/* Chicken Kurkure Momos */}
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4">
              <h3 className="text-gray-900 mb-4 font-semibold">Chicken Kurkure Momos</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Batter (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.chickenKurkureMomos.batter}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenKurkureMomos: { ...formData.chickenKurkureMomos, batter: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Coating Mix (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.chickenKurkureMomos.coating}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenKurkureMomos: { ...formData.chickenKurkureMomos, coating: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Final Kurkure (pcs)</label>
                  <input
                    type="number"
                    value={formData.chickenKurkureMomos.final}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenKurkureMomos: { ...formData.chickenKurkureMomos, final: parseInt(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Wastage Section */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-gray-900 mb-6 flex items-center gap-2">
            <Trash2 className="w-6 h-6 text-red-600" />
            Wastage Tracking
          </h2>

          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Dough Wastage (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.wastage.dough}
                  onChange={(e) => setFormData({
                    ...formData,
                    wastage: { ...formData.wastage, dough: parseFloat(e.target.value) || 0 }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  disabled={!canEdit}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Stuffing Wastage (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.wastage.stuffing}
                  onChange={(e) => setFormData({
                    ...formData,
                    wastage: { ...formData.wastage, stuffing: parseFloat(e.target.value) || 0 }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  disabled={!canEdit}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Batter Wastage (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.wastage.batter}
                  onChange={(e) => setFormData({
                    ...formData,
                    wastage: { ...formData.wastage, batter: parseFloat(e.target.value) || 0 }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  disabled={!canEdit}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Coating Wastage (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.wastage.coating}
                  onChange={(e) => setFormData({
                    ...formData,
                    wastage: { ...formData.wastage, coating: parseFloat(e.target.value) || 0 }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  disabled={!canEdit}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sauces and Chutneys Section */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-gray-900 mb-6 flex items-center gap-2">
            <Soup className="w-6 h-6 text-pink-600" />
            Sauces & Chutneys
          </h2>

          <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Panfried Sauce (L)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.sauces.panfriedSauce}
                  onChange={(e) => setFormData({
                    ...formData,
                    sauces: { ...formData.sauces, panfriedSauce: parseFloat(e.target.value) || 0 }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  disabled={!canEdit}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Chilli Chicken Sauce (L)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.sauces.chilliChickenSauce}
                  onChange={(e) => setFormData({
                    ...formData,
                    sauces: { ...formData.sauces, chilliChickenSauce: parseFloat(e.target.value) || 0 }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  disabled={!canEdit}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Spicy Korean Sauce (L)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.sauces.spicyKoreanSauce}
                  onChange={(e) => setFormData({
                    ...formData,
                    sauces: { ...formData.sauces, spicyKoreanSauce: parseFloat(e.target.value) || 0 }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  disabled={!canEdit}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Hot Garlic Sauce (L)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.sauces.hotGarlicSauce}
                  onChange={(e) => setFormData({
                    ...formData,
                    sauces: { ...formData.sauces, hotGarlicSauce: parseFloat(e.target.value) || 0 }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  disabled={!canEdit}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Tandoori Sauce (L)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.sauces.tandooriSauce}
                  onChange={(e) => setFormData({
                    ...formData,
                    sauces: { ...formData.sauces, tandooriSauce: parseFloat(e.target.value) || 0 }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  disabled={!canEdit}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Soup Premix (L)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.sauces.soupPremix}
                  onChange={(e) => setFormData({
                    ...formData,
                    sauces: { ...formData.sauces, soupPremix: parseFloat(e.target.value) || 0 }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  disabled={!canEdit}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Green Mayo Chutney (L)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.sauces.greenMayoChutney}
                  onChange={(e) => setFormData({
                    ...formData,
                    sauces: { ...formData.sauces, greenMayoChutney: parseFloat(e.target.value) || 0 }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  disabled={!canEdit}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Spicy Red Chutney (L)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.sauces.spicyRedChutney}
                  onChange={(e) => setFormData({
                    ...formData,
                    sauces: { ...formData.sauces, spicyRedChutney: parseFloat(e.target.value) || 0 }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  disabled={!canEdit}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        {canEdit && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-8 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : (productionForDate ? 'Update Production Data' : 'Save Production Data')}
            </button>
          </div>
        )}
      </form>
        </>
      )}
    </div>
  );
}