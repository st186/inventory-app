// Workflow summary, requests by momo type and the requests list by date (moved out of ProductionRequests.tsx unchanged).
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

export function RequestHistory({ vm }: { vm: StockRequestsVM }) {
  const { context, highlightRequestId, selectedStoreId, onNavigateToManageItems, requests, setRequests, loading, setLoading, hasLoadedOnce, setHasLoadedOnce, submitting, setSubmitting, showDuplicateDateConfirm, setShowDuplicateDateConfirm, updatingRequestId, setUpdatingRequestId, filterDate, setFilterDate, filterStatus, setFilterStatus, chartTimeFilter, setChartTimeFilter, showStockStatus, setShowStockStatus, showWorkflow, setShowWorkflow, showMomoTypeStats, setShowMomoTypeStats, getLocalDateString, getDefaultLoadFrom, chartCustomRange, setChartCustomRange, loadedFrom, setLoadedFrom, loadingOlderData, setLoadingOlderData, salesData, setSalesData, momoQuantities, setMomoQuantities, notes, setNotes, getDefaultRequestDate, requestDate, setRequestDate, lastReminderDate, setLastReminderDate, kitchenUtilities, setKitchenUtilities, sauces, setSauces, utilities, setUtilities, showKitchenUtilities, setShowKitchenUtilities, showSauces, setShowSauces, showUtilitiesSection, setShowUtilitiesSection, selectedRecentRequest, setSelectedRecentRequest, showSubmitConfirm, setShowSubmitConfirm, submitConfirmChecked, setSubmitConfirmChecked, showFullHistory, setShowFullHistory, historyFilter, setHistoryFilter, historyCustomRange, setHistoryCustomRange, expandedDates, setExpandedDates, showStoreRecalibration, setShowStoreRecalibration, storeOpeningBalance, setStoreOpeningBalance, mostRecentRecalibration, setMostRecentRecalibration, showThresholdSettings, setShowThresholdSettings, stockThresholds, setStockThresholds, isSyncingPos, setIsSyncingPos, showShippingDialog, setShowShippingDialog, shippingRequest, setShippingRequest, shippedQuantities, setShippedQuantities, shippedSauces, setShippedSauces, shippingNotes, setShippingNotes, shippingResponsibility, setShippingResponsibility, dispatchDraft, setDispatchDraft, slipRequest, setSlipRequest, receivingRequest, setReceivingRequest, momosPerPlate, setMomosPerPlate, showPlateConfigModal, setShowPlateConfigModal, showRecalibrationReports, setShowRecalibrationReports, showStockWastageModal, setShowStockWastageModal, kitchenUtilityItems, sauceItems, utilityItems, isStoreIncharge, isProductionHead, isOperationsHead, isClusterHead, canViewWorkflowSummary, canViewMomoTypeReport, selectedConcreteStoreId, defaultStoreId, scopedStoreIds, singleScopedStoreId, scopedStoreIdSet, storeScopeKey, matchesStoreScope, myHouseIds, matchesRequestScope, storeDisplayName, finishedProducts, myStoreRequests, lastRequest, getRequestedQty, currentStockEstimate, suggestion, setSuggestion, suggesting, setSuggesting, handleSuggest, handleRepeatLastRequest, requestStatusMeta, getFreshAccessToken, loadStockThresholds, loadRequests, ensureFromLoaded, loadSalesData, handleSyncPosNow, recalToStock, loadStoreRecalBaseline, loadStoreOpeningBalance, handleSubmitRequest, handleConfirmAndSubmit, performSubmitRequest, handleStatusUpdate, openShippingDialog, handleShipRequest, getStatusColor, getStatusIcon, filteredRequests, groupedByStatus, groupedByDate, sortedDates } = vm;
  return (
    <>
      {/* Store incharges get a collapsed "View Full Request History" toggle instead of
          the workflow summary + full date history always sprawled below the form -
          Recent Requests and the repeat-last-request shortcut already cover the day-to-day
          need, and the full history stays one tap away for anyone who wants to dig further
          back. Other roles (production head/ops head/cluster head) still see it expanded,
          unchanged, since they rely on it for oversight. */}
      {isStoreIncharge && (
        <button
          type="button"
          onClick={() => setShowFullHistory(!showFullHistory)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-white rounded-lg shadow-sm border border-gray-200 hover:border-orange-200 transition-all"
        >
          <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            View Full Request History
          </span>
          {showFullHistory ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>
      )}

      {(!isStoreIncharge || showFullHistory) && (
      <>
      {isStoreIncharge && (() => {
        const historyFilterOptions: { value: StockFilterPreset; label: string }[] = [
          { value: 'thisWeek', label: 'This Week' },
          { value: 'lastWeek', label: 'Last Week' },
          { value: 'thisMonth', label: 'This Month' },
          { value: 'lastMonth', label: 'Last Month' },
          { value: 'custom', label: 'Custom' },
        ];
        return (
          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
            <select
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value as StockFilterPreset)}
              className="sm:hidden w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 mb-2"
            >
              {historyFilterOptions.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <div className="hidden sm:flex gap-2 overflow-x-auto pb-1 mb-2">
              {historyFilterOptions.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setHistoryFilter(value)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap flex-shrink-0 ${
                    historyFilter === value ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {historyFilter === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DatePicker
                  label="From Date"
                  value={historyCustomRange.from}
                  onChange={(date) => setHistoryCustomRange({ ...historyCustomRange, from: date })}
                />
                <DatePicker
                  label="To Date"
                  value={historyCustomRange.to}
                  onChange={(date) => setHistoryCustomRange({ ...historyCustomRange, to: date })}
                />
              </div>
            )}
          </div>
        );
      })()}

      {/* Live status summary + date/status filters - operations/cluster head oversight,
          production head's fulfillment queue, and the store incharge's own request status. */}
      {canViewWorkflowSummary && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <button
            type="button"
            onClick={() => setShowWorkflow(!showWorkflow)}
            className="w-full flex items-center justify-between gap-2 mb-4 sm:mb-6 text-left"
          >
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">Production Request Workflow</h2>
            {showWorkflow ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />}
          </button>

          {showWorkflow && (
          <>
          <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-3">
            <div className="flex-1 sm:min-w-[200px]">
              <DatePicker
                label="Filter by Date"
                value={filterDate}
                onChange={setFilterDate}
                className="w-full"
              />
            </div>
            <div className="flex-1 sm:min-w-[200px]">
              <label className="block text-sm text-gray-700 mb-2">Filter by Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:border-teal-500 focus:outline-none text-base"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="in-preparation">In Preparation</option>
                <option value="prepared">Prepared</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>
            {(filterDate || filterStatus !== 'all') && (
              <div className="flex sm:items-end">
                <button
                  onClick={() => {
                    setFilterDate('');
                    setFilterStatus('all');
                  }}
                  className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm text-teal-600 hover:text-teal-900 underline font-medium"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
          {loadingOlderData && (
            <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600"></div>
              Loading older requests for this date...
            </div>
          )}

          <div className="relative">
            {/* Connection Line - only meaningful once the grid is a single row */}
            <div className="hidden md:block absolute top-6 left-0 right-0 h-1 bg-gray-200" style={{ zIndex: 0 }}></div>

            {/* Status Cards */}
            <div className="relative grid grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4" style={{ zIndex: 1 }}>
              {/* Pending */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-yellow-500 text-white flex items-center justify-center shadow-lg mb-2 sm:mb-3">
                  <div className="text-center">
                    <div className="text-lg sm:text-2xl">{groupedByStatus.pending.length}</div>
                  </div>
                </div>
                <div className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-lg p-2 sm:p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Clock className="w-3 h-3 text-yellow-600 flex-shrink-0" />
                    <p className="text-xs text-yellow-800">Pending</p>
                  </div>
                </div>
              </div>

              {/* Accepted */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg mb-2 sm:mb-3">
                  <div className="text-center">
                    <div className="text-lg sm:text-2xl">{groupedByStatus.accepted.length}</div>
                  </div>
                </div>
                <div className="w-full bg-blue-50 border-2 border-blue-200 rounded-lg p-2 sm:p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <CheckCircle className="w-3 h-3 text-blue-600 flex-shrink-0" />
                    <p className="text-xs text-blue-800">Accepted</p>
                  </div>
                </div>
              </div>

              {/* In Preparation */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-teal-500 text-white flex items-center justify-center shadow-lg mb-2 sm:mb-3">
                  <div className="text-center">
                    <div className="text-lg sm:text-2xl">{groupedByStatus['in-preparation'].length}</div>
                  </div>
                </div>
                <div className="w-full bg-teal-50 border-2 border-teal-200 rounded-lg p-2 sm:p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Package className="w-3 h-3 text-teal-600 flex-shrink-0" />
                    <p className="text-xs text-teal-800">In Prep</p>
                  </div>
                </div>
              </div>

              {/* Prepared */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg mb-2 sm:mb-3">
                  <div className="text-center">
                    <div className="text-lg sm:text-2xl">{groupedByStatus.prepared.length}</div>
                  </div>
                </div>
                <div className="w-full bg-blue-50 border-2 border-blue-200 rounded-lg p-2 sm:p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <CheckCircle className="w-3 h-3 text-blue-600 flex-shrink-0" />
                    <p className="text-xs text-blue-800">Prepared</p>
                  </div>
                </div>
              </div>

              {/* Shipped - includes partially-shipped requests (shipping has started, even
                  if not every item went out), broken out as a "(N partial)" sub-count so
                  the distinction isn't lost. */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg mb-2 sm:mb-3">
                  <div className="text-center">
                    <div className="text-lg sm:text-2xl">{groupedByStatus.shipped.length + groupedByStatus.shippedPartial.length}</div>
                  </div>
                </div>
                <div className="w-full bg-orange-50 border-2 border-orange-200 rounded-lg p-2 sm:p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Truck className="w-3 h-3 text-orange-600 flex-shrink-0" />
                    <p className="text-xs text-orange-800">Shipped</p>
                  </div>
                  {groupedByStatus.shippedPartial.length > 0 && (
                    <p className="text-[10px] text-orange-600">({groupedByStatus.shippedPartial.length} partial)</p>
                  )}
                </div>
              </div>

              {/* Delivered - includes partially-delivered requests (the request has
                  reached its final resolved state, even if the full requested quantity
                  didn't arrive - matches isDeliveredStatus() elsewhere in this file). */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg mb-2 sm:mb-3">
                  <div className="text-center">
                    <div className="text-lg sm:text-2xl">{groupedByStatus.delivered.length + groupedByStatus.deliveredPartial.length}</div>
                  </div>
                </div>
                <div className="w-full bg-green-50 border-2 border-green-200 rounded-lg p-2 sm:p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <CheckCircle className="w-3 h-3 text-green-600 flex-shrink-0" />
                    <p className="text-xs text-green-800">Delivered</p>
                  </div>
                  {groupedByStatus.deliveredPartial.length > 0 && (
                    <p className="text-[10px] text-green-600">({groupedByStatus.deliveredPartial.length} partial)</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Summary Stats - Awaiting Action + In Progress + Completed now sum to Total
              Requests exactly (CONFIRMED FIX, 2026-08-30): 'shipped' was previously
              missing from "In Progress" entirely, and 'partially-shipped'/
              'partially-delivered' weren't counted anywhere at all. */}
          <div className="mt-6 pt-6 border-t border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl text-gray-900">{filteredRequests.length}</p>
              <p className="text-sm text-gray-600">Total Requests</p>
            </div>
            <div className="text-center">
              <p className="text-2xl text-yellow-600">{groupedByStatus.pending.length}</p>
              <p className="text-sm text-gray-600">Awaiting Action</p>
            </div>
            <div className="text-center">
              <p className="text-2xl text-teal-600">
                {groupedByStatus.accepted.length + groupedByStatus['in-preparation'].length + groupedByStatus.prepared.length + groupedByStatus.shipped.length + groupedByStatus.shippedPartial.length}
              </p>
              <p className="text-sm text-gray-600">In Progress</p>
            </div>
            <div className="text-center">
              <p className="text-2xl text-green-600">{groupedByStatus.delivered.length + groupedByStatus.deliveredPartial.length}</p>
              <p className="text-sm text-gray-600">Completed</p>
            </div>
          </div>
          </>
          )}
        </div>
      )}

      {/* Stock Requests by Momo Type - Card View. Cross-store oversight report, kept to
          operations head + cluster head only - store/production incharge each have their
          own store's/queue's requests in the section below instead. */}
      {canViewMomoTypeReport && (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <button
          type="button"
          onClick={() => setShowMomoTypeStats(!showMomoTypeStats)}
          className="w-full flex items-center justify-between gap-2 mb-4 sm:mb-6 text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp className="w-5 h-5 text-teal-600 flex-shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">Stock Requests by Momo Type</h2>
          </div>
          {showMomoTypeStats ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />}
        </button>

        {showMomoTypeStats && (
        <>
        <div className="mb-4 sm:mb-6">
          {(() => {
            const filterOptions = [
              { filter: 'today', label: 'Today' },
              { filter: 'yesterday', label: 'Yesterday' },
              { filter: 'thisWeek', label: 'This Week' },
              { filter: 'lastWeek', label: 'Last Week' },
              { filter: 'thisMonth', label: 'This Month' },
              { filter: 'lastMonth', label: 'Last Month' },
              { filter: 'custom', label: 'Custom' }
            ];
            return (
              <>
                <select
                  value={chartTimeFilter}
                  onChange={(e) => setChartTimeFilter(e.target.value as any)}
                  className="sm:hidden w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900"
                >
                  {filterOptions.map(({ filter, label }) => (
                    <option key={filter} value={filter}>{label}</option>
                  ))}
                </select>
                <div className="hidden sm:flex gap-2 overflow-x-auto pb-1">
                  {filterOptions.map(({ filter, label }) => (
                    <button
                      key={filter}
                      onClick={() => setChartTimeFilter(filter as any)}
                      className={`px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap flex-shrink-0 ${
                        chartTimeFilter === filter
                          ? 'bg-teal-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            );
          })()}
        </div>

        {chartTimeFilter === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <DatePicker
              label="From Date"
              value={chartCustomRange.from}
              onChange={(date) => setChartCustomRange({ ...chartCustomRange, from: date })}
            />
            <DatePicker
              label="To Date"
              value={chartCustomRange.to}
              onChange={(date) => setChartCustomRange({ ...chartCustomRange, to: date })}
            />
          </div>
        )}

        {loadingOlderData && (
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600"></div>
            Loading older requests for this range...
          </div>
        )}

        {/* Card-based view */}
        {(() => {
          const now = new Date();
          const today = now.toISOString().split('T')[0];
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          
          // Get start of this week (Sunday)
          const thisWeekStart = new Date(now);
          thisWeekStart.setDate(now.getDate() - now.getDay());
          thisWeekStart.setHours(0, 0, 0, 0);
          
          // Get start of last week
          const lastWeekStart = new Date(thisWeekStart);
          lastWeekStart.setDate(thisWeekStart.getDate() - 7);
          const lastWeekEnd = new Date(thisWeekStart);
          lastWeekEnd.setDate(thisWeekStart.getDate() - 1);
          
          // Get start of this month
          const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          
          // Get start and end of last month
          const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
          
          // Filter requests based on selected time period
          let filteredForCards = requests;
          let periodLabel = '';
          
          const chartTimeFilterAny = chartTimeFilter as string;
          if (chartTimeFilterAny === 'today') {
            filteredForCards = requests.filter(r => r.requestDate === today);
            periodLabel = 'Today';
          } else if (chartTimeFilterAny === 'yesterday') {
            filteredForCards = requests.filter(r => r.requestDate === yesterday);
            periodLabel = 'Yesterday';
          } else if (chartTimeFilterAny === 'thisWeek') {
            filteredForCards = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= thisWeekStart && reqDate <= now;
            });
            periodLabel = 'This Week';
          } else if (chartTimeFilterAny === 'lastWeek') {
            filteredForCards = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= lastWeekStart && reqDate <= lastWeekEnd;
            });
            periodLabel = 'Last Week';
          } else if (chartTimeFilterAny === 'thisMonth') {
            filteredForCards = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= thisMonthStart && reqDate <= now;
            });
            periodLabel = 'This Month';
          } else if (chartTimeFilterAny === 'lastMonth') {
            filteredForCards = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= lastMonthStart && reqDate <= lastMonthEnd;
            });
            periodLabel = 'Last Month';
          } else if (chartTimeFilterAny === 'custom') {
            const customStart = new Date(chartCustomRange.from);
            const customEnd = new Date(chartCustomRange.to);
            filteredForCards = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= customStart && reqDate <= customEnd;
            });
            periodLabel = `${chartCustomRange.from} to ${chartCustomRange.to}`;
          }
          
          // Get comparison period (previous period) for percentage calculation
          let comparisonFilteredRequests: typeof requests = [];
          let comparisonLabel = '';
          
          if (chartTimeFilterAny === 'today') {
            const dayBeforeYesterday = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            comparisonFilteredRequests = requests.filter(r => r.requestDate === yesterday);
            comparisonLabel = 'vs Yesterday';
          } else if (chartTimeFilterAny === 'yesterday') {
            const dayBeforeYesterday = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            comparisonFilteredRequests = requests.filter(r => r.requestDate === dayBeforeYesterday);
            comparisonLabel = 'vs Day Before';
          } else if (chartTimeFilterAny === 'thisWeek') {
            const prevWeekStart = new Date(thisWeekStart);
            prevWeekStart.setDate(thisWeekStart.getDate() - 7);
            const prevWeekEnd = new Date(thisWeekStart);
            prevWeekEnd.setDate(thisWeekStart.getDate() - 1);
            comparisonFilteredRequests = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= prevWeekStart && reqDate <= prevWeekEnd;
            });
            comparisonLabel = 'vs Last Week';
          } else if (chartTimeFilterAny === 'lastWeek') {
            const weekBefore = new Date(lastWeekStart);
            weekBefore.setDate(lastWeekStart.getDate() - 7);
            const weekBeforeEnd = new Date(lastWeekStart);
            weekBeforeEnd.setDate(lastWeekStart.getDate() - 1);
            comparisonFilteredRequests = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= weekBefore && reqDate <= weekBeforeEnd;
            });
            comparisonLabel = 'vs Week Before';
          } else if (chartTimeFilterAny === 'thisMonth') {
            // Compare same number of days from last month
            const currentDayOfMonth = now.getDate();
            const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const prevMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, currentDayOfMonth);
            comparisonFilteredRequests = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= prevMonthStart && reqDate <= prevMonthSameDay;
            });
            comparisonLabel = `vs Last Month (Day 1-${currentDayOfMonth})`;
          } else if (chartTimeFilterAny === 'lastMonth') {
            // Get the number of days in last month
            const lastMonthDays = lastMonthEnd.getDate();
            const monthBeforeStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            const monthBeforeSameDay = new Date(now.getFullYear(), now.getMonth() - 2, lastMonthDays);
            comparisonFilteredRequests = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= monthBeforeStart && reqDate <= monthBeforeSameDay;
            });
            comparisonLabel = `vs Month Before (Day 1-${lastMonthDays})`;
          } else if (chartTimeFilterAny === 'custom') {
            const customStart = new Date(chartCustomRange.from);
            const customEnd = new Date(chartCustomRange.to);
            const daysDiff = Math.ceil((customEnd.getTime() - customStart.getTime()) / (1000 * 60 * 60 * 24));
            const comparisonStart = new Date(customStart);
            comparisonStart.setDate(customStart.getDate() - daysDiff - 1);
            const comparisonEnd = new Date(customStart);
            comparisonEnd.setDate(customStart.getDate() - 1);
            comparisonFilteredRequests = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= comparisonStart && reqDate <= comparisonEnd;
            });
            comparisonLabel = 'vs Previous Period';
          }
          
          // Calculate totals for current period: requested vs delivered
          const totalsRequested: Record<string, number> = {};
          const totalsDelivered: Record<string, number> = {};
          finishedProducts.forEach(({ camelKey }) => {
            totalsRequested[camelKey] = 0;
            totalsDelivered[camelKey] = 0;
          });
          
          filteredForCards.forEach(req => {
            const isDelivered = req.status === 'delivered' || req.status === 'partially-delivered';
            finishedProducts.forEach(({ camelKey }) => {
              const newFormat = (req as any)[camelKey] || 0;
              const oldFormat = (req as any)[camelKey + 's'] || 0;
              const requestedQty = newFormat + oldFormat;

              // All requests count as "requested" (the original ask)
              totalsRequested[camelKey] += requestedQty;

              // "Delivered" uses shippedQuantities (the real amount the production house
              // actually shipped) rather than the requested amount - for a
              // partially-shipped/delivered request these differ, and using the requested
              // amount overstated what actually arrived at the store.
              if (isDelivered) {
                const shipped = (req as any).shippedQuantities?.[camelKey];
                const deliveredQty = shipped !== undefined ? shipped : requestedQty;
                totalsDelivered[camelKey] += deliveredQty;
              }
            });
          });
          
          // Calculate totals for comparison period (for percentage)
          const comparisonTotals: Record<string, number> = {};
          finishedProducts.forEach(({ camelKey }) => {
            comparisonTotals[camelKey] = 0;
          });
          
          comparisonFilteredRequests.forEach(req => {
            finishedProducts.forEach(({ camelKey }) => {
              const newFormat = (req as any)[camelKey] || 0;
              const oldFormat = (req as any)[camelKey + 's'] || 0;
              comparisonTotals[camelKey] += newFormat + oldFormat;
            });
          });
          
          // Accent identifies each momo type (icon badge + fulfillment-bar track tint only,
          // never a full pastel card background) - semantic color (fulfillment health) is
          // kept separate from this, same convention used in Stock Request Analysis.
          const accents = [
            { icon: 'bg-violet-50 text-violet-600', ring: 'ring-violet-100' },
            { icon: 'bg-fuchsia-50 text-fuchsia-600', ring: 'ring-fuchsia-100' },
            { icon: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100' },
            { icon: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100' },
            { icon: 'bg-blue-50 text-blue-600', ring: 'ring-blue-100' },
            { icon: 'bg-teal-50 text-teal-600', ring: 'ring-teal-100' },
            { icon: 'bg-rose-50 text-rose-600', ring: 'ring-rose-100' },
            { icon: 'bg-sky-50 text-sky-600', ring: 'ring-sky-100' },
          ];

          const fulfillmentTone = (pct: number | null) => {
            if (pct === null) return { text: 'text-gray-400', bar: 'bg-gray-300' };
            if (pct >= 90) return { text: 'text-emerald-600', bar: 'bg-emerald-500' };
            if (pct >= 60) return { text: 'text-amber-600', bar: 'bg-amber-500' };
            return { text: 'text-red-600', bar: 'bg-red-500' };
          };

          return (
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-gray-500">{periodLabel}</span>
                <span className="text-gray-300">•</span>
                <span className="text-gray-900 font-semibold tabular-nums">{filteredForCards.length}</span>
                <span className="text-gray-500">total requests</span>
              </div>

              {finishedProducts.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No momo types configured yet</p>
                </div>
              ) : filteredForCards.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No stock requests for this period</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {finishedProducts.map((product, index) => {
                    const requested = totalsRequested[product.camelKey] || 0;
                    const delivered = totalsDelivered[product.camelKey] || 0;
                    const comparison = comparisonTotals[product.camelKey] || 0;
                    const accent = accents[index % accents.length];

                    // Calculate percentage change
                    let percentChange = 0;
                    let changeDirection: 'up' | 'down' | 'same' = 'same';
                    if (comparison > 0) {
                      percentChange = ((requested - comparison) / comparison) * 100;
                      if (percentChange > 0) changeDirection = 'up';
                      else if (percentChange < 0) changeDirection = 'down';
                    } else if (requested > 0) {
                      percentChange = 100;
                      changeDirection = 'up';
                    }

                    const fulfillmentPct = requested > 0 ? Math.round((delivered / requested) * 100) : null;
                    const tone = fulfillmentTone(fulfillmentPct);

                    return (
                      <div
                        key={product.camelKey}
                        className="bg-white border border-gray-200 rounded-2xl p-4 transition-all hover:shadow-md hover:border-gray-300"
                      >
                        <div className="flex flex-col gap-4">
                          {/* Header with icon and name */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ring-4 ${accent.icon} ${accent.ring}`}>
                                <Package className="w-4 h-4" />
                              </div>
                              <div className="text-sm font-semibold text-gray-900 truncate">
                                {product.label}
                              </div>
                            </div>

                            {/* Percentage badge */}
                            {comparison > 0 && (
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${
                                changeDirection === 'up' ? 'bg-emerald-50 text-emerald-600' :
                                changeDirection === 'down' ? 'bg-red-50 text-red-600' :
                                'bg-gray-100 text-gray-500'
                              }`}>
                                {changeDirection === 'up' && <ArrowUp className="w-3 h-3" />}
                                {changeDirection === 'down' && <ArrowDown className="w-3 h-3" />}
                                {changeDirection === 'same' && <Minus className="w-3 h-3" />}
                                {Math.abs(percentChange).toFixed(0)}%
                              </div>
                            )}
                          </div>

                          {/* Requested vs Delivered numbers */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                              <div className="text-xl font-bold text-gray-900 tabular-nums">
                                {requested.toLocaleString()}
                              </div>
                              <div className="text-[11px] text-gray-500 font-medium">Requested</div>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                              <div className="text-xl font-bold text-gray-900 tabular-nums">
                                {delivered.toLocaleString()}
                              </div>
                              <div className="text-[11px] text-gray-500 font-medium">Delivered</div>
                            </div>
                          </div>

                          {/* Fulfillment bar - a single delivered/requested ratio, color-coded
                              by health, rather than two separate low-information bars. */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Fulfillment</span>
                              <span className={`font-semibold tabular-nums ${tone.text}`}>
                                {fulfillmentPct === null ? '-' : `${fulfillmentPct}%`}
                              </span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${tone.bar}`}
                                style={{ width: `${fulfillmentPct === null ? 0 : Math.min(fulfillmentPct, 100)}%` }}
                              />
                            </div>
                          </div>

                          {/* Comparison label */}
                          {comparison > 0 && (
                            <div className="text-[11px] text-gray-400 text-center pt-2 border-t border-gray-100">
                              {comparisonLabel}: {comparison.toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
        </>
        )}
      </div>
      )}

      {/* Requests List - Grouped by Date */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">
          {sortedDates.length} Date{sortedDates.length !== 1 ? 's' : ''} with Requests
        </h2>

        {sortedDates.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No production requests found</p>
          </div>
        ) : (
          sortedDates.map((date) => {
            const dateRequests = groupedByDate[date];
            const isExpanded = expandedDates[date];
            const storeCount = new Set(dateRequests.map((r) => r.storeName)).size;
            const totalQuantities = dateRequests.reduce(
              (acc, req) => {
                // Support both new format (chickenMomo) and old format (chickenMomos with 's')
                finishedProducts.forEach(({ camelKey }) => {
                  const newFormat = (req as any)[camelKey] || 0;
                  const oldFormat = (req as any)[camelKey + 's'] || 0;
                  acc[camelKey] = (acc[camelKey] || 0) + newFormat + oldFormat;
                });
                return acc;
              },
              {} as Record<string, number>
            );

            return (
              <div key={date} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden transition-all duration-200 hover:shadow-md">
                {/* Collapsible Date Header */}
                <button
                  onClick={() => setExpandedDates({ ...expandedDates, [date]: !isExpanded })}
                  className="w-full p-4 sm:p-6 text-left flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Calendar className="w-6 h-6 text-teal-600 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight truncate">
                        {(() => {
                          // Parse date as local to avoid timezone issues
                          const [year, month, day] = date.split('-').map(Number);
                          const localDate = new Date(year, month - 1, day);
                          return localDate.toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          });
                        })()}
                      </h3>
                      <p className="text-xs sm:text-sm text-gray-600">
                        {dateRequests.length} Request{dateRequests.length !== 1 ? 's' : ''} from{' '}
                        {storeCount} Store{storeCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Total Quantities - Always Visible */}
                <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                  <div className="bg-gradient-to-r from-teal-50 to-rose-50 rounded-lg p-3 sm:p-4">
                    <h4 className="text-xs sm:text-sm text-gray-700 mb-3">Total Quantities for this Day</h4>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2 sm:gap-3">
                        {totalQuantities.chicken > 0 && (
                          <div className="text-center bg-white rounded-lg p-2 sm:p-3">
                            <p className="text-lg sm:text-xl text-teal-600">{totalQuantities.chicken}</p>
                            <p className="text-xs text-gray-600">Chicken</p>
                          </div>
                        )}
                        {totalQuantities.chickenCheese > 0 && (
                          <div className="text-center bg-white rounded-lg p-2 sm:p-3">
                            <p className="text-lg sm:text-xl text-rose-600">{totalQuantities.chickenCheese}</p>
                            <p className="text-xs text-gray-600">Chicken Cheese</p>
                          </div>
                        )}
                        {totalQuantities.veg > 0 && (
                          <div className="text-center bg-white rounded-lg p-2 sm:p-3">
                            <p className="text-lg sm:text-xl text-green-600">{totalQuantities.veg}</p>
                            <p className="text-xs text-gray-600">Veg</p>
                          </div>
                        )}
                        {totalQuantities.cheeseCorn > 0 && (
                          <div className="text-center bg-white rounded-lg p-2 sm:p-3">
                            <p className="text-lg sm:text-xl text-orange-600">{totalQuantities.cheeseCorn}</p>
                            <p className="text-xs text-gray-600">Cheese Corn</p>
                          </div>
                        )}
                        {totalQuantities.paneer > 0 && (
                          <div className="text-center bg-white rounded-lg p-2 sm:p-3">
                            <p className="text-lg sm:text-xl text-blue-600">{totalQuantities.paneer}</p>
                            <p className="text-xs text-gray-600">Paneer</p>
                          </div>
                        )}
                        {totalQuantities.vegKurkure > 0 && (
                          <div className="text-center bg-white rounded-lg p-2 sm:p-3">
                            <p className="text-lg sm:text-xl text-teal-600">{totalQuantities.vegKurkure}</p>
                            <p className="text-xs text-gray-600">Veg Kurkure</p>
                          </div>
                        )}
                        {totalQuantities.chickenKurkure > 0 && (
                          <div className="text-center bg-white rounded-lg p-2 sm:p-3">
                            <p className="text-lg sm:text-xl text-red-600">{totalQuantities.chickenKurkure}</p>
                            <p className="text-xs text-gray-600">Chicken Kurkure</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                {/* Expanded Content - Store Details */}
                {isExpanded && (
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-0">
                    {/* Individual Store Requests */}
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                        <Package className="w-5 h-5 text-teal-600" />
                        Requests by Store
                      </h4>
                      {dateRequests.map((request) => {
                        const isHighlighted = highlightRequestId === request.id;
                        const isPending = request.status === 'pending';
                        const isUrgent = isPending;
                        
                        return (
                          <div 
                            key={request.id} 
                            id={`request-${request.id}`}
                            className={`
                              relative overflow-hidden rounded-xl transition-all duration-300 transform hover:scale-[1.01]
                              ${isHighlighted 
                                ? 'border-4 border-teal-500 bg-gradient-to-br from-orange-50 via-amber-50 to-orange-50 shadow-2xl ring-4 ring-teal-300/50' 
                                : isPending
                                ? 'border-4 border-yellow-400 bg-gradient-to-br from-yellow-50 via-orange-50 to-yellow-50 shadow-xl'
                                : 'border-2 border-gray-200 bg-white shadow-lg'
                              }
                            `}
                          >
                            {/* Urgency Banner for Pending Requests */}
                            {isPending && (
                              <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 h-2"></div>
                            )}
                            
                            <div className="p-5">
                              {/* Request ID Badge */}
                              <div className="flex items-center justify-between mb-4">
                                <div className={`
                                  px-4 py-2 rounded-full font-semibold shadow-md
                                  ${isPending 
                                    ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-gray-900' 
                                    : 'bg-gradient-to-r from-teal-400 to-rose-400 text-white'
                                  }
                                `}>
                                  <span className="text-sm flex items-center gap-2">
                                    <strong>Request ID:</strong> {request.id.slice(0, 8).toUpperCase()}
                                  </span>
                                </div>
                                {isHighlighted && (
                                  <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white px-4 py-2 rounded-full text-sm font-bold animate-bounce shadow-lg">
                                    🔔 New Notification
                                  </div>
                                )}
                                {isPending && !isHighlighted && (
                                  <div className="bg-gradient-to-r from-red-600 to-orange-600 text-white px-4 py-2 rounded-full text-sm font-bold animate-pulse shadow-lg">
                                    ⚡ ACTION REQUIRED
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-col gap-4 mb-4">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                                    <div className={`
                                      px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2 border-3 shadow-lg
                                      ${isPending 
                                        ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-gray-900 border-orange-500' 
                                        : getStatusColor(request.status)
                                      }
                                    `}>
                                      {getStatusIcon(request.status)}
                                      <span className="capitalize text-base">{request.status.replace('-', ' ')}</span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 text-base font-semibold text-gray-700 bg-white px-4 py-2 rounded-lg shadow-md">
                                      <Store className="w-5 h-5 flex-shrink-0 text-teal-600" />
                                      <span className="truncate">{request.storeName || 'Unknown Store'}</span>
                                      {(request as any).eventId && <span className="flex-shrink-0 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-semibold text-foreground">Event</span>}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                                  {/* Production Head Actions */}
                                  {isProductionHead && request.status === 'pending' && (
                                  <button
                                    onClick={() => handleStatusUpdate(request.id, 'accepted')}
                                    disabled={updatingRequestId === request.id}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2"
                                  >
                                    {updatingRequestId === request.id && (
                                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    )}
                                    {updatingRequestId === request.id ? 'Accepting...' : 'Accept Request'}
                                  </button>
                                )}

                                {isProductionHead && request.status === 'accepted' && (
                                  <button
                                    onClick={() => handleStatusUpdate(request.id, 'in-preparation')}
                                    disabled={updatingRequestId === request.id}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 active:bg-teal-800 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2"
                                  >
                                    {updatingRequestId === request.id && (
                                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    )}
                                    {updatingRequestId === request.id ? 'Starting...' : 'Start Preparation'}
                                  </button>
                                )}

                                {isProductionHead && request.status === 'in-preparation' && (
                                  <button
                                    onClick={() => handleStatusUpdate(request.id, 'prepared')}
                                    disabled={updatingRequestId === request.id}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2"
                                  >
                                    {updatingRequestId === request.id && (
                                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    )}
                                    {updatingRequestId === request.id ? 'Updating...' : 'Mark as Prepared'}
                                  </button>
                                )}

                                {isProductionHead && request.status === 'prepared' && (
                                  <button
                                    onClick={() => openShippingDialog(request)}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 active:bg-orange-800 transition-colors text-sm font-medium"
                                  >
                                    Mark as Shipped
                                  </button>
                                )}

                                {/* Store In-Charge Actions */}
                                {isStoreIncharge && (request.status === 'shipped' || request.status === 'partially-shipped') && (
                                  isPhase1Live(getTodayIST()) ? (
                                    <button
                                      onClick={() => setReceivingRequest(request)}
                                      className="w-full sm:w-auto px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 active:bg-green-800 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                                    >
                                      Receive &amp; Count
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleStatusUpdate(request.id, request.status === 'partially-shipped' ? 'partially-delivered' : 'delivered')}
                                      disabled={updatingRequestId === request.id}
                                      className="w-full sm:w-auto px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 active:bg-green-800 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2"
                                    >
                                      {updatingRequestId === request.id && (
                                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      )}
                                      {updatingRequestId === request.id ? 'Confirming...' : 'Confirm Delivery'}
                                    </button>
                                  )
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                              <User className="w-4 h-4" />
                              <span>Requested by: {request.requestedByName || request.requestedBy}</span>
                            </div>

                            {/* Fulfillment Details - shows once shipped: requested vs actually shipped, highlighting shortfalls */}
                            {request.shippedQuantities && (
                              <div
                                id={`fulfillment-${request.id}`}
                                className={`rounded-xl p-5 mb-4 border-2 shadow-lg scroll-mt-24 ${
                                  request.status === 'partially-shipped' || request.status === 'partially-delivered'
                                    ? 'bg-gradient-to-br from-red-50 to-orange-50 border-red-300'
                                    : 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-300'
                                } ${highlightRequestId === request.id ? 'ring-4 ring-orange-400 ring-offset-2' : ''}`}
                              >
                                <h5 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                                  <Truck className="w-5 h-5" />
                                  Fulfillment Details
                                  {(request.status === 'partially-shipped' || request.status === 'partially-delivered') && (
                                    <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-1 rounded-full">Items Missing</span>
                                  )}
                                </h5>

                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                  {finishedProducts.map(({ camelKey, label }) => {
                                    const requestedQty = (request as any)[camelKey] || 0;
                                    if (requestedQty === 0) return null;
                                    const shippedQty = request.shippedQuantities?.[camelKey] || 0;
                                    const isShort = shippedQty < requestedQty;
                                    return (
                                      <div key={camelKey} className={`rounded-lg p-3 border-2 ${isShort ? 'bg-red-100 border-red-400' : 'bg-white border-green-200'}`}>
                                        <p className={`text-xs font-semibold ${isShort ? 'text-red-700' : 'text-gray-600'}`}>{label.replace(' Momos', '').replace(' Momo', '')}</p>
                                        <p className={`text-lg font-bold ${isShort ? 'text-red-700' : 'text-green-700'}`}>
                                          {shippedQty} <span className="text-xs font-normal text-gray-500">/ {requestedQty} requested</span>
                                        </p>
                                        {isShort && <p className="text-xs text-red-600 font-medium">Short by {requestedQty - shippedQty}</p>}
                                      </div>
                                    );
                                  })}

                                  {request.kitchenUtilities && Object.entries(request.kitchenUtilities).map(([name, data]) => {
                                    const shippedQty = request.shippedQuantities?.[`kitchenUtility_${name}`] || 0;
                                    const isShort = shippedQty < data.quantity;
                                    return (
                                      <div key={`ku_${name}`} className={`rounded-lg p-3 border-2 ${isShort ? 'bg-red-100 border-red-400' : 'bg-white border-green-200'}`}>
                                        <p className={`text-xs font-semibold ${isShort ? 'text-red-700' : 'text-gray-600'}`}>{name}</p>
                                        <p className={`text-lg font-bold ${isShort ? 'text-red-700' : 'text-green-700'}`}>
                                          {shippedQty} <span className="text-xs font-normal text-gray-500">/ {data.quantity} {data.unit}</span>
                                        </p>
                                        {isShort && <p className="text-xs text-red-600 font-medium">Short by {data.quantity - shippedQty} {data.unit}</p>}
                                      </div>
                                    );
                                  })}

                                  {request.utilities && Object.entries(request.utilities).map(([name, requestedQty]) => {
                                    const shippedQty = request.shippedQuantities?.[`utility_${name}`] || 0;
                                    const isShort = shippedQty < requestedQty;
                                    return (
                                      <div key={`u_${name}`} className={`rounded-lg p-3 border-2 ${isShort ? 'bg-red-100 border-red-400' : 'bg-white border-green-200'}`}>
                                        <p className={`text-xs font-semibold ${isShort ? 'text-red-700' : 'text-gray-600'}`}>{name}</p>
                                        <p className={`text-lg font-bold ${isShort ? 'text-red-700' : 'text-green-700'}`}>
                                          {shippedQty} <span className="text-xs font-normal text-gray-500">/ {requestedQty} pcs</span>
                                        </p>
                                        {isShort && <p className="text-xs text-red-600 font-medium">Short by {requestedQty - shippedQty}</p>}
                                      </div>
                                    );
                                  })}
                                </div>

                                {request.sauces && Object.keys(request.sauces).length > 0 && (
                                  <div className="mt-4 pt-4 border-t border-gray-200">
                                    <p className="text-xs font-semibold text-gray-600 mb-2">Sauces</p>
                                    {/* Same card style as the momo/utility grid above (green = delivered,
                                        red = not), instead of a plain chip - a missing sauce used to be
                                        the one shortfall type on this page with no reason attached. */}
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                      {Object.keys(request.sauces).map((sauce) => {
                                        const wasShipped = request.shippedSauces ? request.shippedSauces[sauce] : true;
                                        const reason = request.shippingNotes?.[`sauce_${sauce}`];
                                        return (
                                          <div key={sauce} className={`rounded-lg p-3 border-2 ${wasShipped ? 'bg-white border-green-200' : 'bg-red-100 border-red-400'}`}>
                                            <p className={`text-sm font-semibold ${wasShipped ? 'text-gray-700' : 'text-red-700'}`}>{sauce}</p>
                                            <p className={`text-xs font-medium ${wasShipped ? 'text-green-700' : 'text-red-600'}`}>
                                              {wasShipped ? 'Delivered' : 'Not delivered'}
                                            </p>
                                            {!wasShipped && reason && (
                                              <p className="text-xs text-red-600 mt-0.5">Reason: {reason}</p>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {request.shippingNotes && Object.entries(request.shippingNotes).some(([key]) => !key.startsWith('sauce_')) && (
                                  <div className="mt-4 pt-4 border-t border-gray-200 space-y-1">
                                    <p className="text-xs font-semibold text-gray-600 mb-1">Notes</p>
                                    {/* Sauce reasons are excluded here - they're already shown inline on the
                                        sauce's own card above, right next to its Delivered/Not delivered status. */}
                                    {Object.entries(request.shippingNotes).filter(([key]) => !key.startsWith('sauce_')).map(([key, note]) => (
                                      <p key={key} className="text-sm text-gray-700">
                                        <span className="font-medium">{key.replace(/_/g, ' ')}:</span> {note}
                                      </p>
                                    ))}
                                  </div>
                                )}

                                <DispatchDetails request={request} products={finishedProducts} onOpenSlip={() => setSlipRequest(request)} />
                                <ReceiptSummary request={request} products={finishedProducts} accessToken={context.user?.accessToken || ''} />
                              </div>
                            )}

                            {/* Momos Quantities - DYNAMIC */}
                            <div className="bg-gradient-to-br from-blue-50 via-teal-50 to-rose-50 rounded-xl p-4 mb-4 border-2 border-blue-200 shadow-md">
                              <h5 className="text-base font-bold text-blue-800 mb-4 flex items-center gap-2">
                                <Package className="w-5 h-5" />
                                Momos Quantities
                              </h5>
                              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3">
                                {finishedProducts.map(({ camelKey, label }) => {
                                  const quantity = (request as any)[camelKey];
                                  if (!quantity || quantity === 0) return null;
                                  
                                  return (
                                    <div key={camelKey} className="text-center bg-white rounded-lg p-3 shadow-md border-2 border-blue-200 hover:border-blue-400 transition-all transform hover:scale-105">
                                      <p className="text-2xl font-bold text-blue-600">{quantity}</p>
                                      <p className="text-xs font-semibold text-gray-700 mt-1">{label.replace(' Momos', '').replace(' Momo', '')}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Kitchen Utilities */}
                            {request.kitchenUtilities && Object.keys(request.kitchenUtilities).length > 0 && (
                              <div className="bg-gradient-to-br from-teal-100 via-teal-50 to-rose-100 rounded-xl p-5 mb-4 border-2 border-teal-300 shadow-lg">
                                <h5 className="text-base font-bold text-teal-900 mb-4 flex items-center gap-2">
                                  <Utensils className="w-6 h-6 text-teal-700" />
                                  Kitchen Utilities
                                </h5>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                  {Object.entries(request.kitchenUtilities).map(([item, data]) => (
                                    <div key={item} className="bg-white rounded-lg p-4 shadow-md border-2 border-teal-200 hover:border-teal-400 transition-all transform hover:scale-105">
                                      <p className="text-2xl font-bold text-teal-700 mb-1">{data.quantity} <span className="text-sm font-semibold text-teal-600">{data.unit}</span></p>
                                      <p className="text-sm font-semibold text-gray-800">{item}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Sauces */}
                            {request.sauces && Object.keys(request.sauces).length > 0 && (
                              <div className="bg-gradient-to-br from-rose-100 via-rose-50 to-rose-100 rounded-xl p-5 mb-4 border-2 border-rose-300 shadow-lg">
                                <h5 className="text-base font-bold text-rose-900 mb-4 flex items-center gap-2">
                                  <Droplet className="w-6 h-6 text-rose-700" />
                                  Sauces Requested
                                </h5>
                                <div className="flex flex-wrap gap-3">
                                  {Object.keys(request.sauces).map((sauce) => (
                                    <span key={sauce} className="px-5 py-3 bg-gradient-to-r from-rose-400 to-red-400 text-white rounded-xl text-base font-bold shadow-lg hover:shadow-xl transform hover:scale-110 transition-all">
                                      {sauce}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Utilities */}
                            {request.utilities && Object.keys(request.utilities).length > 0 && (
                              <div className="bg-gradient-to-br from-blue-100 via-blue-50 to-blue-100 rounded-xl p-5 mb-4 border-2 border-blue-300 shadow-lg">
                                <h5 className="text-base font-bold text-blue-900 mb-4 flex items-center gap-2">
                                  <Box className="w-6 h-6 text-blue-700" />
                                  Utilities
                                </h5>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  {Object.entries(request.utilities).map(([item, quantity]) => (
                                    <div key={item} className="bg-white rounded-lg p-4 shadow-md border-2 border-blue-200 hover:border-blue-400 transition-all transform hover:scale-105">
                                      <p className="text-2xl font-bold text-blue-700 mb-1">{quantity} <span className="text-sm font-semibold text-blue-600">pcs</span></p>
                                      <p className="text-sm font-semibold text-gray-800">{item}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {request.notes && (
                              <div className="bg-gradient-to-r from-blue-100 to-cyan-100 border-l-4 border-blue-500 p-4 rounded-lg mb-4 shadow-md">
                                <p className="text-base text-gray-900 font-semibold"><span className="text-blue-700">📝 Notes:</span> {request.notes}</p>
                              </div>
                            )}

                            {/* Timeline */}
                            <div className="pt-3 border-t border-gray-200">
                              <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                                <div>Created: {new Date(request.createdAt).toLocaleString()}</div>
                                {request.acceptedAt && <div>Accepted: {new Date(request.acceptedAt).toLocaleString()}</div>}
                                {request.preparedAt && <div>Prepared: {new Date(request.preparedAt).toLocaleString()}</div>}
                                {request.shippedAt && <div>Shipped: {new Date(request.shippedAt).toLocaleString()}</div>}
                                {request.deliveredAt && <div>Delivered: {new Date(request.deliveredAt).toLocaleString()}</div>}
                              </div>
                            </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      </>
      )}
    </>
  );
}
