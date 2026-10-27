// Stock wastage entry and the store stock status card (moved out of ProductionRequests.tsx unchanged).
import { useState, useEffect, useMemo } from 'react';
import { InventoryContextType } from '../../App';
import * as api from '../../utils/api';
import { toast } from 'sonner@2.0.3';
import { Package, Clock, CheckCircle, Truck, Calendar, User, Store, Send, ArrowRight, Filter, TrendingUp, ChevronDown, ChevronUp, Settings, AlertTriangle, X, Utensils, Droplet, Box, ArrowUp, ArrowDown, Minus, RefreshCw, FileText, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { getSupabaseClient } from '../../utils/supabase/client';
import { DatePicker } from '../DatePicker';
import { MonthlyStockRecalibration } from '../MonthlyStockRecalibration';
import { StockThresholdSettings } from '../StockThresholdSettings';
import { RecalibrationReports } from '../RecalibrationReports';
import { StockWastageModal } from '../StockWastageModal';
import { getAssignedProductionHouseIds, getAssignedStoreIds, getDefaultStoreId } from '../../utils/entityAccess';
import { EventMomoReturnsCard } from '../events/EventMomoReturnsCard';
import { bagSize, bagsLabel, roundUpToBags, isPhase1Live } from '../../utils/batches';
import { getTodayIST } from '../../utils/timezone';
import { suggestRequest, type ForecastDay, type MomoKey } from '../../utils/forecast';
import { ShipDialogBags, PackingFields, DispatchDraft, emptyDispatchDraft, buildDispatchInfo } from '../dispatch/ShipDialogBags';
import { DispatchSlipModal, DispatchDetails } from '../dispatch/DispatchSlip';
import { ReceiveDeliveryDialog, ReceiptSummary } from '../dispatch/ReceiveDeliveryDialog';
import { getStockFilterRange, type StockFilterPreset } from './requestPeriods';
import type { StockRequestsVM } from './useStockRequests';

export function StockStatusSection({ vm }: { vm: StockRequestsVM }) {
  const { context, highlightRequestId, selectedStoreId, onNavigateToManageItems, requests, setRequests, loading, setLoading, hasLoadedOnce, setHasLoadedOnce, submitting, setSubmitting, showDuplicateDateConfirm, setShowDuplicateDateConfirm, updatingRequestId, setUpdatingRequestId, filterDate, setFilterDate, filterStatus, setFilterStatus, chartTimeFilter, setChartTimeFilter, showStockStatus, setShowStockStatus, showWorkflow, setShowWorkflow, showMomoTypeStats, setShowMomoTypeStats, getLocalDateString, getDefaultLoadFrom, chartCustomRange, setChartCustomRange, loadedFrom, setLoadedFrom, loadingOlderData, setLoadingOlderData, salesData, setSalesData, momoQuantities, setMomoQuantities, notes, setNotes, getDefaultRequestDate, requestDate, setRequestDate, lastReminderDate, setLastReminderDate, kitchenUtilities, setKitchenUtilities, sauces, setSauces, utilities, setUtilities, showKitchenUtilities, setShowKitchenUtilities, showSauces, setShowSauces, showUtilitiesSection, setShowUtilitiesSection, selectedRecentRequest, setSelectedRecentRequest, showSubmitConfirm, setShowSubmitConfirm, submitConfirmChecked, setSubmitConfirmChecked, showFullHistory, setShowFullHistory, historyFilter, setHistoryFilter, historyCustomRange, setHistoryCustomRange, expandedDates, setExpandedDates, showStoreRecalibration, setShowStoreRecalibration, storeOpeningBalance, setStoreOpeningBalance, mostRecentRecalibration, setMostRecentRecalibration, showThresholdSettings, setShowThresholdSettings, stockThresholds, setStockThresholds, isSyncingPos, setIsSyncingPos, showShippingDialog, setShowShippingDialog, shippingRequest, setShippingRequest, shippedQuantities, setShippedQuantities, shippedSauces, setShippedSauces, shippingNotes, setShippingNotes, shippingResponsibility, setShippingResponsibility, dispatchDraft, setDispatchDraft, slipRequest, setSlipRequest, receivingRequest, setReceivingRequest, momosPerPlate, setMomosPerPlate, showPlateConfigModal, setShowPlateConfigModal, showRecalibrationReports, setShowRecalibrationReports, showStockWastageModal, setShowStockWastageModal, kitchenUtilityItems, sauceItems, utilityItems, isStoreIncharge, isProductionHead, isOperationsHead, isClusterHead, canViewWorkflowSummary, canViewMomoTypeReport, selectedConcreteStoreId, defaultStoreId, scopedStoreIds, singleScopedStoreId, scopedStoreIdSet, storeScopeKey, matchesStoreScope, myHouseIds, matchesRequestScope, storeDisplayName, finishedProducts, myStoreRequests, lastRequest, getRequestedQty, currentStockEstimate, suggestion, setSuggestion, suggesting, setSuggesting, handleSuggest, handleRepeatLastRequest, requestStatusMeta, getFreshAccessToken, loadStockThresholds, loadRequests, ensureFromLoaded, loadSalesData, handleSyncPosNow, recalToStock, loadStoreRecalBaseline, loadStoreOpeningBalance, handleSubmitRequest, handleConfirmAndSubmit, performSubmitRequest, handleStatusUpdate, openShippingDialog, handleShipRequest, getStatusColor, getStatusIcon, filteredRequests, groupedByStatus, groupedByDate, sortedDates } = vm;
  return (
    <>
      {/* Stock Wastage - logs today's momo wastage, in pieces, one number per momo type
          (including both kurkure varieties). Tracked from launch (2026-08-30) forward
          only. Placed at the top (before Store Stock Status) since it's a daily entry
          action, not a report. Visible to everyone with canViewWorkflowSummary - not
          just Store Incharge - so Operations/Cluster/Production heads can view and
          log/correct it too; shown regardless of canViewMomoTypeReport since that gate
          is for the cross-store oversight report further down, not this entry action. */}
      {canViewWorkflowSummary && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">Stock Wastage</h2>
              <p className="text-xs text-gray-500">Log today's momo wastage, in pieces, by type</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (!singleScopedStoreId) {
                toast.info('Select one store to log wastage');
                return;
              }
              setShowStockWastageModal(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all shadow-md hover:shadow-lg flex-shrink-0"
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-sm font-semibold whitespace-nowrap">Log Wastage</span>
          </button>
        </div>
      )}

      {/* Stock Status Overview */}
      <div className="bg-white rounded-xl shadow-md border border-green-200 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-5 bg-gradient-to-r from-green-50 to-emerald-50">
          <button
            type="button"
            onClick={() => setShowStockStatus(!showStockStatus)}
            className="flex items-start gap-3 text-left flex-1 min-w-0"
          >
            <div className="w-10 h-10 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-green-900 mb-0.5 flex items-center gap-2">
                Store Stock Status
                {showStockStatus ? <ChevronUp className="w-5 h-5 text-green-600 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-green-600 flex-shrink-0" />}
              </h2>
              <p className="text-xs sm:text-sm text-green-700">
                Total inventory received from production house - Stock sold
              </p>
            </div>
          </button>
          {isStoreIncharge && (() => {
            // CHANGED: Recalibration now enabled for entire month for Store Incharges
            // Notifications will be sent to Operations Managers and Cluster Heads
            return (
              <button
                onClick={() => setShowStoreRecalibration(true)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap bg-gradient-to-r from-teal-600 to-emerald-600 text-white hover:from-teal-700 hover:to-emerald-700 shadow-md font-semibold w-full sm:w-auto flex-shrink-0"
              >
                <CheckCircle className="w-5 h-5" />
                Recalibrate Stock
              </button>
            );
          })()}
        </div>

        {showStockStatus && (
        <>
        <div className="p-4 sm:p-6">
        {/* Currently Viewing Banner */}
        {(() => {
          const activeLabel = 'This Month';

          return (
            <div className="bg-gradient-to-r from-green-100 to-green-50 border-l-4 border-green-600 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Calendar className="w-5 h-5 text-green-700 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-green-900">
                      Store Stock Status ({activeLabel})
                    </p>
                    <p className="text-xs text-green-700">
                      Opening balance + Received in period − Sold in period
                    </p>
                  </div>
                </div>
                {/* Small icon-only sync button, tucked in the corner rather than a big CTA */}
                <button
                  onClick={handleSyncPosNow}
                  disabled={isSyncingPos}
                  className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all shadow-sm disabled:opacity-50 flex-shrink-0"
                  title={isSyncingPos ? 'Syncing...' : "Sync Now - fetch today's sales/stock from Ciferon POS right now, instead of waiting for the 10:30 PM automatic sync"}
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncingPos ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {isClusterHead && (
                  <button
                    onClick={() => {
                      if (!singleScopedStoreId) {
                        toast.info('Select one store to edit alert settings');
                        return;
                      }
                      setShowThresholdSettings(true);
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-white border-2 border-green-600 text-green-700 rounded-lg hover:bg-green-50 transition-all flex-1 sm:flex-none"
                  >
                    <Settings className="w-4 h-4" />
                    <span className="text-sm font-semibold whitespace-nowrap">Alert Settings</span>
                  </button>
                )}
                {isClusterHead && (
                  <button
                    onClick={() => setShowPlateConfigModal(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-900 transition-all shadow-md hover:shadow-lg flex-1 sm:flex-none"
                  >
                    <Settings className="w-4 h-4" />
                    <span className="text-sm font-semibold whitespace-nowrap">Plate Config</span>
                  </button>
                )}
                {onNavigateToManageItems && isClusterHead && (
                  <button
                    onClick={onNavigateToManageItems}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 transition-all shadow-md hover:shadow-lg flex-1 sm:flex-none"
                  >
                    <Package className="w-4 h-4" />
                    <span className="text-sm font-semibold whitespace-nowrap">Manage Items</span>
                  </button>
                )}
                {isClusterHead && (
                  <button
                    onClick={() => setShowRecalibrationReports(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-white border-2 border-blue-600 text-blue-700 rounded-lg hover:bg-blue-50 transition-all flex-1 sm:flex-none"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span className="text-sm font-semibold whitespace-nowrap">Recalibration</span>
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {(() => {
          // Calculate Store Stock Status for the current month:
          // Store Stock = Opening Balance + Received this month - Sold this month

          const { start: rangeStart, end: rangeEnd } = getStockFilterRange('thisMonth', { from: '', to: '' });
          const inRange = (dateStr: string | undefined) => !!dateStr && dateStr.substring(0, 10) >= rangeStart && dateStr.substring(0, 10) <= rangeEnd;

          const deliveredRequests = context.productionRequests?.filter(req => {
            // Only requests actually marked delivered/partially-delivered represent stock
            // that has physically reached the store. "pending" is the very first status
            // (just requested, not yet accepted/prepared/shipped) - it was previously
            // miscounted here as "received", which is not what that status means.
            if (req.status !== 'delivered' && req.status !== 'partially-delivered') return false;

            const deliveryDate = req.deliveredAt || req.requestDate || req.createdAt;
            if (!inRange(deliveryDate)) return false;
            // Momos delivered to an event stall (events.ts) are the event's stock, not a store's.
            if ((req as any).eventId) return false;

            return matchesStoreScope(req.storeId);
          }) || [];

          // Aggregate the period's received quantities. Uses shippedQuantities (the real
          // amount the production house actually shipped, entered at the ship step) rather
          // than the originally requested amount - for a partially-shipped/delivered request
          // these two differ, and the requested amount overstates what actually arrived.
          const totalReceived = deliveredRequests.reduce((acc, req) => {
            finishedProducts.forEach(({ camelKey }) => {
              const shipped = (req as any).shippedQuantities?.[camelKey];
              const newFormat = (req as any)[camelKey] || 0;
              const oldFormat = (req as any)[camelKey + 's'] || 0; // Old requests have 's' at end
              const value = shipped !== undefined ? shipped : (newFormat + oldFormat);
              acc[camelKey] = (acc[camelKey] || 0) + value;
            });
            return acc;
          }, {} as Record<string, number>);

          // Get the period's sales data for this store
          const storeSales = salesData.filter((s: any) => {
            if (!inRange(s.date)) return false;

            return matchesStoreScope(s.storeId);
          });
          
          // Aggregate current month's sales dynamically
          const totalSales = storeSales.reduce((acc: any, sale: any) => {
            finishedProducts.forEach(({ camelKey, legacySalesKey }) => {
              // Get value from the legacySalesKey
              let salesValue = sale.data?.[legacySalesKey] || 0;
              
              // Backward compatibility: Check for old "Corn Cheese Momos" naming
              if (legacySalesKey === 'Cheese Corn Momos' && salesValue === 0) {
                salesValue = sale.data?.['Corn Cheese Momos'] || 0;
              }
              
              acc[camelKey] = (acc[camelKey] || 0) + salesValue;
            });
            return acc;
          }, {} as Record<string, number>);
          
          // Get opening balance from state (or initialize with zeros for all products)
          const openingBalance = storeOpeningBalance || 
            finishedProducts.reduce((acc, { camelKey }) => {
              acc[camelKey] = 0;
              return acc;
            }, {} as Record<string, number>);
          
          console.log('📊 Store Stock Status Calculation Debug:');
          console.log('  storeOpeningBalance from state:', storeOpeningBalance);
          console.log('  openingBalance being used:', openingBalance);
          console.log('  totalReceived:', totalReceived);
          console.log('  🐔 Chicken Momo (chicken) received:', totalReceived.chicken || 0);
          console.log('  🐔 Chicken Kurkure (chickenKurkure) received:', totalReceived.chickenKurkure || 0);
          console.log('  totalSales:', totalSales);
          console.log('  finishedProducts count:', finishedProducts.length);
          
          // CRITICAL FIX: Don't show stock status until opening balance is loaded
          // If storeOpeningBalance is null, it means it's still loading
          if (storeOpeningBalance === null) {
            console.log('  ⚠️ Opening balance not loaded yet, showing loading state');
            return (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-6 mt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-5 h-5 text-green-700" />
                  <p className="text-sm font-semibold text-green-900">
                    Store Stock Status
                  </p>
                </div>
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                  <p className="ml-3 text-sm text-green-700">Loading opening balance...</p>
                </div>
              </div>
            );
          }
          
          // Calculate store stock
          // NEW LOGIC: If there's a more recent recalibration (mid-month), use it as baseline
          // Stock = Most Recent Recalibration + (Received AFTER it) - (Sold AFTER it)
          // Otherwise: Stock = Opening Balance + Total Received - Total Sold
          
          const storeStock: Record<string, number> = {};
          
          if (mostRecentRecalibration) {
            console.log('  🔄 Using MOST RECENT recalibration as baseline:');
            console.log('    Recalibration date:', mostRecentRecalibration.date);
            console.log('    Recalibration stock:', mostRecentRecalibration.stock);
            
            // Calculate received and sold AFTER the most recent recalibration
            const recalDate = mostRecentRecalibration.date;
            // Extract just the date portion (YYYY-MM-DD) for comparison
            const recalDateOnly = recalDate.substring(0, 10);
            
            const receivedAfterRecal: Record<string, number> = {};
            const soldAfterRecal: Record<string, number> = {};
            
            // Filter received requests to only count those AFTER recalibration
            deliveredRequests.forEach(req => {
              const deliveryDate = req.deliveredAt || req.requestDate || req.createdAt;
              // Compare only the date portion (YYYY-MM-DD)
              const deliveryDateOnly = deliveryDate ? deliveryDate.substring(0, 10) : '';
              if (deliveryDateOnly && deliveryDateOnly > recalDateOnly) {
                finishedProducts.forEach(({ camelKey }) => {
                  const shipped = (req as any).shippedQuantities?.[camelKey];
                  const value = shipped !== undefined ? shipped : ((req as any)[camelKey] || 0);
                  receivedAfterRecal[camelKey] = (receivedAfterRecal[camelKey] || 0) + value;
                });
              }
            });
            
            // Filter sales to only count those AFTER recalibration date
            // For same-day sales, include them (use >=) because sales don't have timestamps
            storeSales.forEach((sale: any) => {
              const saleDate = sale.date;
              // Compare only the date portion
              const saleDateOnly = saleDate ? saleDate.substring(0, 10) : '';
              if (saleDateOnly && saleDateOnly >= recalDateOnly) {
                finishedProducts.forEach(({ camelKey, legacySalesKey }) => {
                  let salesValue = sale.data?.[legacySalesKey] || 0;
                  if (legacySalesKey === 'Cheese Corn Momos' && salesValue === 0) {
                    salesValue = sale.data?.['Corn Cheese Momos'] || 0;
                  }
                  soldAfterRecal[camelKey] = (soldAfterRecal[camelKey] || 0) + salesValue;
                });
              }
            });
            
            console.log('    Received AFTER recalibration:', receivedAfterRecal);
            console.log('    Sold AFTER recalibration:', soldAfterRecal);
            
            // Calculate stock based on most recent recalibration
            finishedProducts.forEach(({ camelKey }) => {
              const recalStock = mostRecentRecalibration.stock[camelKey] || 0;
              const receivedAfter = receivedAfterRecal[camelKey] || 0;
              const soldAfter = soldAfterRecal[camelKey] || 0;
              storeStock[camelKey] = recalStock + receivedAfter - soldAfter;
              
              console.log(`    ${camelKey}: ${recalStock} (recal) + ${receivedAfter} (received) - ${soldAfter} (sold) = ${storeStock[camelKey]}`);
            });
          } else {
            // No mid-month recalibration - use opening balance
            console.log('  📊 Using opening balance (no mid-month recalibration)');
            finishedProducts.forEach(({ camelKey }) => {
              storeStock[camelKey] = (openingBalance[camelKey] || 0) + (totalReceived[camelKey] || 0) - (totalSales[camelKey] || 0);
            });
          }
          
          console.log('  storeStock calculated:', storeStock);
          
          // Color palette for momo cards
          const colorPalette = ['violet', 'fuchsia', 'green', 'yellow', 'blue', 'teal', 'red', 'sky', 'orange', 'cyan'];
          
          const totalReceivedSum = Object.values(totalReceived).reduce((sum: number, val: any) => sum + val, 0);
          const totalOpeningBalanceSum = Object.values(openingBalance).reduce((sum: number, val: any) => sum + val, 0);
          const totalRecalibrationSum = mostRecentRecalibration
            ? Object.values(mostRecentRecalibration.stock || {}).reduce((sum: number, val: any) => sum + val, 0)
            : 0;
          const totalStockSum = totalReceivedSum + totalOpeningBalanceSum + totalRecalibrationSum;
          
          console.log('  totalReceivedSum:', totalReceivedSum);
          console.log('  totalOpeningBalanceSum:', totalOpeningBalanceSum);
          console.log('  totalRecalibrationSum:', totalRecalibrationSum);
          console.log('  totalStockSum:', totalStockSum);
          
          if (totalStockSum === 0) {
            return (
              <div className="bg-gray-50 rounded-lg p-8 text-center">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600">No inventory available for this period ({rangeStart} to {rangeEnd})</p>
                <p className="text-sm text-gray-500 mt-2">
                  Stock will appear here once:
                </p>
                <ul className="text-sm text-gray-500 mt-2 list-disc list-inside">
                  <li>Your requests are <strong>delivered</strong> by the production house</li>
                  <li>OR you perform a stock recalibration (1st-5th of each month)</li>
                </ul>
                <p className="text-xs text-blue-600 mt-4">
                  💡 Tip: Check if your requests have been marked as "Delivered" below
                </p>
              </div>
            );
          }
          
          return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
              {finishedProducts.map(({ camelKey, label }, index) => {
                const received = totalReceived[camelKey] || 0;
                const sold = totalSales[camelKey] || 0;
                const stock = storeStock[camelKey] || 0;
                const opening = openingBalance[camelKey] || 0;
                const totalAvailable = opening + received; // Total available = opening + received
                const color = colorPalette[index % colorPalette.length];
                
                // Get threshold levels for this momo type
                const thresholds = stockThresholds[camelKey] || { high: 600, medium: 300, low: 150 };
                
                // Determine stock level and alert
                let stockLevel: 'high' | 'medium' | 'low' | 'critical' = 'high';
                let alertBgColor = '';
                let alertTextColor = '';
                let alertBorderColor = '';
                let alertLabel = '';
                
                if (stock <= 0) {
                  stockLevel = 'critical';
                  alertBgColor = 'bg-red-100';
                  alertTextColor = 'text-red-700';
                  alertBorderColor = 'border-red-300';
                  alertLabel = 'CRITICAL';
                } else if (stock <= thresholds.low) {
                  stockLevel = 'low';
                  alertBgColor = 'bg-red-100';
                  alertTextColor = 'text-red-700';
                  alertBorderColor = 'border-red-300';
                  alertLabel = 'LOW';
                } else if (stock <= thresholds.medium) {
                  stockLevel = 'medium';
                  alertBgColor = 'bg-orange-100';
                  alertTextColor = 'text-orange-700';
                  alertBorderColor = 'border-orange-300';
                  alertLabel = 'MEDIUM';
                } else if (stock < thresholds.high) {
                  stockLevel = 'medium';
                  alertBgColor = 'bg-yellow-100';
                  alertTextColor = 'text-yellow-700';
                  alertBorderColor = 'border-yellow-300';
                  alertLabel = 'MEDIUM';
                }
                
                const isLowStock = stock < totalAvailable * 0.2 && totalAvailable > 0; // Less than 20%
                
                return (
                  <div key={camelKey} className={`bg-gradient-to-br from-${color}-50 to-${color}-100 border-2 border-${color}-200 rounded-lg p-2.5 relative`}>
                    {/* Stock Alert Badge */}
                    {stockLevel !== 'high' && (
                      <div className={`absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded ${alertBgColor} border ${alertBorderColor}`}>
                        <AlertTriangle className={`w-3 h-3 ${alertTextColor}`} />
                        <span className={`text-[10px] font-semibold ${alertTextColor} uppercase`}>{alertLabel}</span>
                      </div>
                    )}

                    <h3 className="text-xs font-semibold text-gray-900 mb-1.5 pr-14 truncate">{label}</h3>

                    <div className="flex justify-between items-center text-[11px] text-gray-600">
                      <span>Received: <span className={`font-semibold text-${color}-700`}>{received}</span></span>
                      <span>Sold: <span className={`font-semibold text-${color}-700`}>{sold}</span></span>
                    </div>

                    <div className="border-t border-gray-300 mt-1.5 pt-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-medium text-gray-500">Available</span>
                      <div className={`text-sm font-bold ${isLowStock ? 'text-red-600' : stock < 0 ? 'text-red-600' : `text-${color}-800`}`}>
                        {stock} pcs / {Math.round(stock / momosPerPlate)} pl
                      </div>
                    </div>

                    {(isLowStock || stock < 0) && (
                      <p className="text-[10px] text-red-700 font-semibold mt-1">
                        {stock < 0 ? '⚠️ Oversold' : '⚠️ Low'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
        </div>
        </>
        )}
      </div>
    </>
  );
}
