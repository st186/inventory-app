// The store incharge's request form (moved out of ProductionRequests.tsx unchanged).
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

export function StoreRequestForm({ vm }: { vm: StockRequestsVM }) {
  const { context, highlightRequestId, selectedStoreId, onNavigateToManageItems, requests, setRequests, loading, setLoading, hasLoadedOnce, setHasLoadedOnce, submitting, setSubmitting, showDuplicateDateConfirm, setShowDuplicateDateConfirm, updatingRequestId, setUpdatingRequestId, filterDate, setFilterDate, filterStatus, setFilterStatus, chartTimeFilter, setChartTimeFilter, showStockStatus, setShowStockStatus, showWorkflow, setShowWorkflow, showMomoTypeStats, setShowMomoTypeStats, getLocalDateString, getDefaultLoadFrom, chartCustomRange, setChartCustomRange, loadedFrom, setLoadedFrom, loadingOlderData, setLoadingOlderData, salesData, setSalesData, momoQuantities, setMomoQuantities, notes, setNotes, getDefaultRequestDate, requestDate, setRequestDate, lastReminderDate, setLastReminderDate, kitchenUtilities, setKitchenUtilities, sauces, setSauces, utilities, setUtilities, showKitchenUtilities, setShowKitchenUtilities, showSauces, setShowSauces, showUtilitiesSection, setShowUtilitiesSection, selectedRecentRequest, setSelectedRecentRequest, showSubmitConfirm, setShowSubmitConfirm, submitConfirmChecked, setSubmitConfirmChecked, showFullHistory, setShowFullHistory, historyFilter, setHistoryFilter, historyCustomRange, setHistoryCustomRange, expandedDates, setExpandedDates, showStoreRecalibration, setShowStoreRecalibration, storeOpeningBalance, setStoreOpeningBalance, mostRecentRecalibration, setMostRecentRecalibration, showThresholdSettings, setShowThresholdSettings, stockThresholds, setStockThresholds, isSyncingPos, setIsSyncingPos, showShippingDialog, setShowShippingDialog, shippingRequest, setShippingRequest, shippedQuantities, setShippedQuantities, shippedSauces, setShippedSauces, shippingNotes, setShippingNotes, shippingResponsibility, setShippingResponsibility, dispatchDraft, setDispatchDraft, slipRequest, setSlipRequest, receivingRequest, setReceivingRequest, momosPerPlate, setMomosPerPlate, showPlateConfigModal, setShowPlateConfigModal, showRecalibrationReports, setShowRecalibrationReports, showStockWastageModal, setShowStockWastageModal, kitchenUtilityItems, sauceItems, utilityItems, isStoreIncharge, isProductionHead, isOperationsHead, isClusterHead, canViewWorkflowSummary, canViewMomoTypeReport, selectedConcreteStoreId, defaultStoreId, scopedStoreIds, singleScopedStoreId, scopedStoreIdSet, storeScopeKey, matchesStoreScope, myHouseIds, matchesRequestScope, storeDisplayName, finishedProducts, myStoreRequests, lastRequest, getRequestedQty, currentStockEstimate, suggestion, setSuggestion, suggesting, setSuggesting, handleSuggest, handleRepeatLastRequest, requestStatusMeta, getFreshAccessToken, loadStockThresholds, loadRequests, ensureFromLoaded, loadSalesData, handleSyncPosNow, recalToStock, loadStoreRecalBaseline, loadStoreOpeningBalance, handleSubmitRequest, handleConfirmAndSubmit, performSubmitRequest, handleStatusUpdate, openShippingDialog, handleShipRequest, getStatusColor, getStatusIcon, filteredRequests, groupedByStatus, groupedByDate, sortedDates } = vm;
  return (
    <>
      {/* Store In-Charge Request Form */}
      {isStoreIncharge && (
        <div className="bg-white rounded-xl shadow-md border border-orange-100 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-orange-50 to-red-50 border-b border-orange-100">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center flex-shrink-0">
              <Send className="w-4.5 h-4.5 text-white" />
            </div>
            <h2 className="text-base sm:text-xl font-bold text-gray-900">Submit Stock Request</h2>
          </div>
          <div className="p-4 sm:p-6">

          {/* Recent Requests - status at a glance, so checking on an existing request
              doesn't require scrolling past the whole form down to the history list. */}
          {myStoreRequests.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm text-gray-700 mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-500" />
                Recent Requests
              </h3>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {myStoreRequests.slice(0, 3).map((req) => {
                  const meta = requestStatusMeta[req.status] || requestStatusMeta.pending;
                  const summary = finishedProducts
                    .map(({ camelKey, label }) => ({ label: label.replace(' Momo', ''), qty: getRequestedQty(req, camelKey) }))
                    .filter(p => p.qty > 0)
                    .sort((a, b) => b.qty - a.qty)
                    .slice(0, 3)
                    .map(p => `${p.qty} ${p.label}`)
                    .join(' · ');
                  const shortageKeys = req.shippingNotes ? Object.keys(req.shippingNotes) : [];
                  return (
                    <button
                      key={req.id}
                      type="button"
                      onClick={() => setSelectedRecentRequest(req)}
                      className="flex-shrink-0 min-w-[190px] max-w-[220px] border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md hover:border-orange-300 transition-all bg-white text-left cursor-pointer"
                    >
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border mb-1.5 ${meta.className}`}>
                        {meta.label}
                      </span>
                      <p className="text-xs text-gray-500 mb-1">
                        {req.status === 'delivered' || req.status === 'partially-delivered'
                          ? `Delivered ${new Date(req.deliveredAt || req.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                          : `Submitted ${new Date(req.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                      </p>
                      <p className="text-sm text-gray-900 font-medium">{summary || 'No momo items'}</p>
                      {shortageKeys.length > 0 && (
                        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                          {shortageKeys.length} item{shortageKeys.length !== 1 ? 's' : ''} short
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Suggest from the forecast (store incharge) */}
          {isStoreIncharge && (
            <div className="mb-3 bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-lg p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Suggest from the forecast</p>
                    <p className="text-xs text-gray-600">Expected sales for the day + 15%, less what's left from the last delivery, in whole bags</p>
                  </div>
                </div>
                <button type="button" onClick={handleSuggest} disabled={suggesting} className="flex-shrink-0 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold active:scale-95 transition-all shadow-sm disabled:opacity-60 inline-flex items-center gap-1.5">
                  {suggesting && <Loader2 className="w-4 h-4 animate-spin" />} Suggest
                </button>
              </div>
              {suggestion && (
                <div className="mt-2 pt-2 border-t border-violet-100 text-xs text-gray-700 space-y-0.5">
                  <p className="font-semibold text-violet-900">
                    {new Date(`${suggestion.day.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}: expected about ₹{suggestion.day.revenue.toLocaleString('en-IN')}
                    {suggestion.day.event && suggestion.day.event.effect !== 'normal' ? ` - ${suggestion.day.event.name}` : ''}
                  </p>
                  {suggestion.rows.filter((r) => r.expected > 0 || r.pieces > 0).map((r) => (
                    <p key={r.key} className="tabular-nums">
                      <span className="font-semibold">{r.label} {r.pieces}</span>{r.pieces ? ` (${r.bags} bag${r.bags === 1 ? '' : 's'})` : ''} = expected {r.expected} + 15%{r.carry ? ` − ${r.carry} left from ${suggestion.carryFrom ? new Date(`${suggestion.carryFrom}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' }) : 'last'}'s delivery` : ''}
                    </p>
                  ))}
                  <p className="text-gray-500 pt-1">Counted stock in the freezer differs? Adjust the numbers below before sending.</p>
                </div>
              )}
            </div>
          )}

          {/* Repeat last request - day-to-day quantities are usually very similar, so
              pre-filling from the last submission saves re-typing the same numbers. */}
          {lastRequest && (
            <div className="mb-4 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-lg p-3 shadow-sm flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-start gap-2.5">
                <RefreshCw className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Repeat last request?</p>
                  <p className="text-xs text-gray-600 truncate">
                    {new Date(lastRequest.requestDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}:{' '}
                    {finishedProducts
                      .map(({ camelKey, label }) => ({ label: label.replace(' Momo', ''), qty: getRequestedQty(lastRequest, camelKey) }))
                      .filter(p => p.qty > 0)
                      .slice(0, 3)
                      .map(p => `${p.qty} ${p.label}`)
                      .join(' · ')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRepeatLastRequest}
                className="flex-shrink-0 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 active:scale-95 transition-all shadow-sm"
              >
                Use this
              </button>
            </div>
          )}

          <form onSubmit={handleSubmitRequest} className="space-y-6">
            <div className="rounded-lg border-2 border-amber-100 bg-amber-50 p-3 sm:p-4">
              <label className="text-sm font-bold text-amber-900 flex items-center gap-2 mb-2">
                <Calendar className="w-5 h-5 text-amber-600 flex-shrink-0" />
                Request Date
              </label>
              <DatePicker
                label=""
                value={requestDate}
                onChange={setRequestDate}
                className="w-full"
              />
            </div>

            <div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-3 flex items-center gap-2 pb-2 border-b-2 border-teal-100">
                <div className="w-7 h-7 rounded-md bg-teal-600 flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4 text-white" />
                </div>
                Momo Quantities
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {finishedProducts.map(({ camelKey, label }) => {
                  // Quick preset values based on typical order sizes
                  const presetValues = camelKey === 'chicken'
                    ? [150, 300, 450, 600]
                    : [60, 120, 180, 300];
                  const have = currentStockEstimate[camelKey] ?? 0;
                  const haveClassName = have <= 0
                    ? 'bg-red-50 text-red-600'
                    : have < 60
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-green-50 text-green-700';
                  const current = momoQuantities[camelKey] || 0;
                  // Whole bags from Phase 1 go-live; before that the old free steps.
                  const wholeBags = isPhase1Live(requestDate);
                  const step = wholeBags ? bagSize(camelKey) : (camelKey === 'chicken' ? 30 : 15);

                  return (
                    <div key={camelKey} className="border border-gray-200 rounded-lg p-2 sm:p-3 bg-white shadow-sm hover:shadow-md hover:border-orange-200 transition-all min-w-0">
                      <div className="mb-1.5">
                        <label className="block text-sm sm:text-base font-semibold text-gray-900 leading-snug">{label}</label>
                        <span className={`inline-block mt-1 text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-full ${haveClassName}`}>
                          have {have}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-1.5">
                        <button
                          type="button"
                          onClick={() => setMomoQuantities({ ...momoQuantities, [camelKey]: wholeBags ? Math.max(0, Math.ceil(current / step) * step - step) : Math.max(0, current - step) })}
                          className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-md text-gray-700 text-xs sm:text-sm font-bold hover:bg-gray-50"
                        >
                          −
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={current}
                          onChange={(e) => setMomoQuantities({
                            ...momoQuantities,
                            [camelKey]: parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0
                          })}
                          onBlur={() => {
                            if (!wholeBags) return;
                            const rounded = roundUpToBags(current, camelKey);
                            if (rounded !== current) setMomoQuantities((prev) => ({ ...prev, [camelKey]: rounded }));
                          }}
                          aria-label={`${label} pieces`}
                          className="w-full min-w-0 px-1 py-2.5 sm:px-2 sm:py-3 border-2 border-gray-300 rounded-lg focus:border-teal-500 focus:outline-none text-sm sm:text-lg text-center font-bold tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => setMomoQuantities({ ...momoQuantities, [camelKey]: wholeBags ? Math.floor(current / step) * step + step : current + step })}
                          className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-md text-gray-700 text-xs sm:text-sm font-bold hover:bg-gray-50"
                        >
                          +
                        </button>
                      </div>
                      {wholeBags && (
                        <p className="mt-1 text-[11px] text-gray-500 text-center tabular-nums">
                          {current > 0 ? bagsLabel(current, camelKey) : `bags of ${step}`}
                        </p>
                      )}
                      <div className="grid grid-cols-4 gap-1 mt-1.5 sm:mt-2">
                        {presetValues.map(val => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setMomoQuantities({
                              ...momoQuantities,
                              [camelKey]: val
                            })}
                            className="px-1 py-1 bg-teal-50 hover:bg-teal-100 text-teal-600 border border-teal-100 rounded-md text-[10px] sm:text-[11px] font-medium transition-colors"
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Kitchen Utilities Section - collapsed by default, most days stay at zero.
                A distinct colored header bar + 2-column item grid so this doesn't read as
                one more long undifferentiated scroll of fields. */}
            <div className="rounded-lg border-2 border-teal-100 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowKitchenUtilities(!showKitchenUtilities)}
                className="w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-3 bg-teal-50 text-left"
              >
                <h3 className="text-base sm:text-lg font-bold text-teal-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-teal-600 flex-shrink-0" />
                  Kitchen Utilities <span className="text-xs text-teal-600 font-normal">(Optional)</span>
                </h3>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {Object.keys(kitchenUtilities).length > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-600 text-white">
                      {Object.keys(kitchenUtilities).length} added
                    </span>
                  )}
                  {showKitchenUtilities ? <ChevronUp className="w-5 h-5 text-teal-600" /> : <ChevronDown className="w-5 h-5 text-teal-600" />}
                </div>
              </button>
              {showKitchenUtilities && (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 p-3 sm:p-4 bg-white">
                {kitchenUtilityItems.map((item) => {
                  const qty = kitchenUtilities[item.name]?.quantity ?? 0;
                  const setQty = (quantity: number) => {
                    const rounded = Math.max(0, Math.round(quantity * 100) / 100);
                    if (rounded > 0) {
                      setKitchenUtilities({
                        ...kitchenUtilities,
                        [item.name]: { quantity: rounded, unit: item.unit }
                      });
                    } else {
                      const newUtils = { ...kitchenUtilities };
                      delete newUtils[item.name];
                      setKitchenUtilities(newUtils);
                    }
                  };
                  return (
                  <div key={item.name} className="border border-gray-200 rounded-lg p-2">
                    <label className="block text-xs sm:text-sm font-semibold text-gray-900 mb-1.5 leading-snug">
                      {item.name} <span className="text-gray-500 font-normal">({item.unit})</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setQty(qty - 1)}
                        className="w-7 h-7 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-lg text-gray-700 text-base font-bold hover:bg-gray-50"
                      >
                        −
                      </button>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={kitchenUtilities[item.name]?.quantity !== undefined ? kitchenUtilities[item.name].quantity : ''}
                        onChange={(e) => setQty(parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
                        className="w-full min-w-0 px-1 py-1.5 sm:px-2 sm:py-2 border-2 border-gray-300 rounded-lg focus:border-teal-500 focus:outline-none text-sm sm:text-base text-center tabular-nums"
                        placeholder="Qty"
                      />
                      <button
                        type="button"
                        onClick={() => setQty(qty + 1)}
                        className="w-7 h-7 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-lg text-gray-700 text-base font-bold hover:bg-gray-50"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
              )}
            </div>

            {/* Sauces Section - collapsed by default, chip toggles instead of a long
                checkbox list */}
            <div className="rounded-lg border-2 border-rose-100 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSauces(!showSauces)}
                className="w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-3 bg-rose-50 text-left"
              >
                <h3 className="text-base sm:text-lg font-bold text-rose-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-rose-600 flex-shrink-0" />
                  Sauces
                </h3>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {Object.keys(sauces).length > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-600 text-white">
                      {Object.keys(sauces).length} selected
                    </span>
                  )}
                  {showSauces ? <ChevronUp className="w-5 h-5 text-rose-600" /> : <ChevronDown className="w-5 h-5 text-rose-600" />}
                </div>
              </button>
              {showSauces && (
              <div className="flex flex-wrap gap-2 p-3 sm:p-4 bg-white">
                {sauceItems.map((sauce) => {
                  const on = sauces[sauce] || false;
                  return (
                    <button
                      key={sauce}
                      type="button"
                      onClick={() => {
                        if (on) {
                          const newSauces = { ...sauces };
                          delete newSauces[sauce];
                          setSauces(newSauces);
                        } else {
                          setSauces({ ...sauces, [sauce]: true });
                        }
                      }}
                      className={`px-3 py-2 rounded-full text-sm border-2 transition-colors ${
                        on ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-rose-300'
                      }`}
                    >
                      {sauce}
                    </button>
                  );
                })}
              </div>
              )}
            </div>

            {/* Utilities Section */}
            <div className="rounded-lg border-2 border-blue-100 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowUtilitiesSection(!showUtilitiesSection)}
                className="w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-3 bg-blue-50 text-left"
              >
                <h3 className="text-base sm:text-lg font-bold text-blue-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  Utilities <span className="text-xs text-blue-600 font-normal">(pieces)</span>
                </h3>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {Object.keys(utilities).length > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                      {Object.keys(utilities).length} added
                    </span>
                  )}
                  {showUtilitiesSection ? <ChevronUp className="w-5 h-5 text-blue-600" /> : <ChevronDown className="w-5 h-5 text-blue-600" />}
                </div>
              </button>
              {showUtilitiesSection && (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 p-3 sm:p-4 bg-white">
                {utilityItems.map((item) => {
                  const qty = utilities[item] ?? 0;
                  const setQty = (quantity: number) => {
                    const rounded = Math.max(0, Math.round(quantity));
                    if (rounded > 0) {
                      setUtilities({ ...utilities, [item]: rounded });
                    } else {
                      const newUtils = { ...utilities };
                      delete newUtils[item];
                      setUtilities(newUtils);
                    }
                  };
                  return (
                  <div key={item} className="border border-gray-200 rounded-lg p-2">
                    <label className="block text-xs sm:text-sm font-semibold text-gray-900 mb-1.5">{item}</label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setQty(qty - 1)}
                        className="w-7 h-7 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-lg text-gray-700 text-base font-bold hover:bg-gray-50"
                      >
                        −
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={utilities[item] !== undefined ? utilities[item] : ''}
                        onChange={(e) => setQty(parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                        className="w-full min-w-0 px-1 py-1.5 sm:px-2 sm:py-2 border-2 border-gray-300 rounded-lg focus:border-teal-500 focus:outline-none text-sm sm:text-base text-center tabular-nums"
                        placeholder="Pieces"
                      />
                      <button
                        type="button"
                        onClick={() => setQty(qty + 1)}
                        className="w-7 h-7 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-lg text-gray-700 text-base font-bold hover:bg-gray-50"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
              )}
            </div>

            <div className="rounded-lg border-2 border-gray-200 bg-gray-50 p-3 sm:p-4">
              <label className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-gray-500 flex-shrink-0" />
                Additional Notes <span className="text-xs text-gray-500 font-normal">(Optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 sm:px-4 sm:py-3 border-2 border-gray-300 rounded-lg focus:border-teal-500 focus:outline-none resize-none bg-white text-sm sm:text-base"
                placeholder="Any special requirements or notes..."
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-orange-600 to-red-600 text-white py-4 rounded-lg hover:from-orange-700 hover:to-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base font-medium shadow-lg active:scale-95"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>Submit Request</span>
                </>
              )}
            </button>
          </form>
          </div>
        </div>
      )}
    </>
  );
}
