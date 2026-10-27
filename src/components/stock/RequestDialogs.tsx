// The screen's pop-ups: recalibration, thresholds, reports, wastage, request detail, review, duplicate, plate config, shipping, slip and receive (moved out of ProductionRequests.tsx unchanged).
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

export function RequestDialogs({ vm }: { vm: StockRequestsVM }) {
  const { context, highlightRequestId, selectedStoreId, onNavigateToManageItems, requests, setRequests, loading, setLoading, hasLoadedOnce, setHasLoadedOnce, submitting, setSubmitting, showDuplicateDateConfirm, setShowDuplicateDateConfirm, updatingRequestId, setUpdatingRequestId, filterDate, setFilterDate, filterStatus, setFilterStatus, chartTimeFilter, setChartTimeFilter, showStockStatus, setShowStockStatus, showWorkflow, setShowWorkflow, showMomoTypeStats, setShowMomoTypeStats, getLocalDateString, getDefaultLoadFrom, chartCustomRange, setChartCustomRange, loadedFrom, setLoadedFrom, loadingOlderData, setLoadingOlderData, salesData, setSalesData, momoQuantities, setMomoQuantities, notes, setNotes, getDefaultRequestDate, requestDate, setRequestDate, lastReminderDate, setLastReminderDate, kitchenUtilities, setKitchenUtilities, sauces, setSauces, utilities, setUtilities, showKitchenUtilities, setShowKitchenUtilities, showSauces, setShowSauces, showUtilitiesSection, setShowUtilitiesSection, selectedRecentRequest, setSelectedRecentRequest, showSubmitConfirm, setShowSubmitConfirm, submitConfirmChecked, setSubmitConfirmChecked, showFullHistory, setShowFullHistory, historyFilter, setHistoryFilter, historyCustomRange, setHistoryCustomRange, expandedDates, setExpandedDates, showStoreRecalibration, setShowStoreRecalibration, storeOpeningBalance, setStoreOpeningBalance, mostRecentRecalibration, setMostRecentRecalibration, showThresholdSettings, setShowThresholdSettings, stockThresholds, setStockThresholds, isSyncingPos, setIsSyncingPos, showShippingDialog, setShowShippingDialog, shippingRequest, setShippingRequest, shippedQuantities, setShippedQuantities, shippedSauces, setShippedSauces, shippingNotes, setShippingNotes, shippingResponsibility, setShippingResponsibility, dispatchDraft, setDispatchDraft, slipRequest, setSlipRequest, receivingRequest, setReceivingRequest, momosPerPlate, setMomosPerPlate, showPlateConfigModal, setShowPlateConfigModal, showRecalibrationReports, setShowRecalibrationReports, showStockWastageModal, setShowStockWastageModal, kitchenUtilityItems, sauceItems, utilityItems, isStoreIncharge, isProductionHead, isOperationsHead, isClusterHead, canViewWorkflowSummary, canViewMomoTypeReport, selectedConcreteStoreId, defaultStoreId, scopedStoreIds, singleScopedStoreId, scopedStoreIdSet, storeScopeKey, matchesStoreScope, myHouseIds, matchesRequestScope, storeDisplayName, finishedProducts, myStoreRequests, lastRequest, getRequestedQty, currentStockEstimate, suggestion, setSuggestion, suggesting, setSuggesting, handleSuggest, handleRepeatLastRequest, requestStatusMeta, getFreshAccessToken, loadStockThresholds, loadRequests, ensureFromLoaded, loadSalesData, handleSyncPosNow, recalToStock, loadStoreRecalBaseline, loadStoreOpeningBalance, handleSubmitRequest, handleConfirmAndSubmit, performSubmitRequest, handleStatusUpdate, openShippingDialog, handleShipRequest, getStatusColor, getStatusIcon, filteredRequests, groupedByStatus, groupedByDate, sortedDates } = vm;
  return (
    <>
      {/* Store Stock Recalibration Modal */}
      {showStoreRecalibration && (
        <MonthlyStockRecalibration
          context={context}
          selectedStoreId={singleScopedStoreId}
          onClose={() => setShowStoreRecalibration(false)}
          isProductionHouse={false}
          isStoreFinishedProducts={true}
        />
      )}
      
      {/* Stock Threshold Settings Modal */}
      {showThresholdSettings && (
        <StockThresholdSettings
          storeId={singleScopedStoreId || ''}
          accessToken={context.user?.accessToken || ''}
          thresholds={stockThresholds}
          onClose={() => setShowThresholdSettings(false)}
          onSave={(newThresholds) => {
            setStockThresholds(newThresholds);
            setShowThresholdSettings(false);
          }}
        />
      )}

      {/* Recalibration Reports Modal - relocated here from its own Analytics.tsx sub-tab so
          it lives beside Manage Items instead of a separate window tab. RecalibrationReports
          renders its own content banner but no overlay/close chrome of its own, so this wraps
          it the same way the other modals on this screen wrap their content. */}
      {showRecalibrationReports && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowRecalibrationReports(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-end p-3 border-b border-gray-100">
              <button onClick={() => setShowRecalibrationReports(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-all">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 sm:p-6">
              <RecalibrationReports context={context} selectedStoreId={singleScopedStoreId} locationType="store" />
            </div>
          </div>
        </div>
      )}

      {/* Stock Wastage Modal */}
      {showStockWastageModal && singleScopedStoreId && (
        <StockWastageModal
          context={context}
          storeId={singleScopedStoreId}
          finishedProducts={finishedProducts}
          onClose={() => setShowStockWastageModal(false)}
        />
      )}

      {/* Recent Request detail popup - tapping a Recent Requests card surfaces the full
          breakdown (quantities, kitchen utilities, sauces, utilities, timeline, shortages)
          instead of the card just sitting there un-clickable. */}
      {selectedRecentRequest && (() => {
        const req = selectedRecentRequest;
        const meta = requestStatusMeta[req.status] || requestStatusMeta.pending;
        const itemRows = finishedProducts
          .map(({ camelKey, label }) => ({ label, requested: getRequestedQty(req, camelKey), shipped: (req as any).shippedQuantities?.[camelKey] }))
          .filter(r => r.requested > 0);
        const kitchenUtilEntries = Object.entries(req.kitchenUtilities || {});
        const sauceNames = Object.keys(req.sauces || {}).filter(s => (req.sauces as any)[s]);
        const utilityEntries = Object.entries(req.utilities || {});
        // Excludes sauce_* entries - those reasons are already shown inline next to the
        // sauce's own "Not delivered" chip above, with the plain sauce name rather than the
        // raw sauce_ prefixed key.
        const shippingNoteEntries = Object.entries(req.shippingNotes || {}).filter(([key]) => !key.startsWith('sauce_'));
        const timeline: { label: string; at?: string }[] = [
          { label: 'Created', at: req.createdAt },
          { label: 'Accepted', at: req.acceptedAt },
          { label: 'Prepared', at: req.preparedAt },
          { label: 'Shipped', at: req.shippedAt },
          { label: 'Delivered', at: req.deliveredAt },
        ].filter(t => t.at);

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedRecentRequest(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-orange-600 to-red-600 p-5 text-white rounded-t-2xl flex items-start justify-between gap-3">
                <div>
                  <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border mb-2 bg-white ${meta.className}`}>
                    {meta.label}
                  </span>
                  <h3 className="text-lg font-semibold">
                    {new Date(req.requestDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                  </h3>
                </div>
                <button type="button" onClick={() => setSelectedRecentRequest(null)} className="flex-shrink-0 p-1 hover:bg-white/20 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {itemRows.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Momo Quantities</h4>
                    <div className="space-y-1">
                      {itemRows.map(r => (
                        <div key={r.label} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{r.label}</span>
                          <span className="font-medium text-gray-900">
                            {r.shipped !== undefined && r.shipped !== r.requested
                              ? <span className="text-red-600">{r.shipped} / {r.requested} requested</span>
                              : `${r.requested}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {kitchenUtilEntries.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Kitchen Utilities</h4>
                    <div className="space-y-1">
                      {kitchenUtilEntries.map(([name, val]) => (
                        <div key={name} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{name}</span>
                          <span className="font-medium text-gray-900">{val.quantity} {val.unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sauceNames.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Sauces</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {sauceNames.map(s => {
                        // Only meaningful once shipped - a request still pending/preparing has no
                        // shippedSauces yet, so treat it as "requested" rather than "delivered".
                        const hasShipped = !!req.shippedQuantities;
                        const wasShipped = !hasShipped || (req.shippedSauces ? req.shippedSauces[s] : true);
                        const reason = req.shippingNotes?.[`sauce_${s}`];
                        return (
                          <span
                            key={s}
                            title={!wasShipped && reason ? `Not delivered - ${reason}` : undefined}
                            className={`px-2 py-0.5 border rounded-full text-xs ${
                              !hasShipped ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : wasShipped ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-red-50 text-red-700 border-red-300'
                            }`}
                          >
                            {s}{hasShipped && !wasShipped ? ' — Not delivered' : ''}
                          </span>
                        );
                      })}
                    </div>
                    {sauceNames.some(s => req.shippedQuantities && !(req.shippedSauces ? req.shippedSauces[s] : true) && req.shippingNotes?.[`sauce_${s}`]) && (
                      <div className="mt-1.5 space-y-0.5">
                        {sauceNames.filter(s => req.shippedQuantities && !(req.shippedSauces ? req.shippedSauces[s] : true) && req.shippingNotes?.[`sauce_${s}`]).map(s => (
                          <p key={s} className="text-xs text-red-600"><span className="font-medium">{s}:</span> {req.shippingNotes![`sauce_${s}`]}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {utilityEntries.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Utilities</h4>
                    <div className="space-y-1">
                      {utilityEntries.map(([name, qty]) => (
                        <div key={name} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{name}</span>
                          <span className="font-medium text-gray-900">{qty} pcs</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {req.notes && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">Notes</h4>
                    <p className="text-sm text-gray-600">{req.notes}</p>
                  </div>
                )}

                {shippingNoteEntries.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <h4 className="text-sm font-semibold text-red-800 mb-1 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      Shortage Notes
                    </h4>
                    <div className="space-y-0.5">
                      {shippingNoteEntries.map(([key, note]) => (
                        <p key={key} className="text-xs text-red-700"><span className="font-medium">{key}:</span> {note}</p>
                      ))}
                    </div>
                  </div>
                )}

                {timeline.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Timeline</h4>
                    <div className="space-y-1">
                      {timeline.map(t => (
                        <div key={t.label} className="flex items-center justify-between text-xs text-gray-500">
                          <span>{t.label}</span>
                          <span>{new Date(t.at!).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 bg-gray-50 rounded-b-2xl flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedRecentRequest(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Review-before-submit popup - date + full summary, with a checkbox that must be
          ticked before Confirm & Submit is enabled. Runs before the duplicate-date check
          and the actual API call, both handled in handleConfirmAndSubmit. */}
      {showSubmitConfirm && isStoreIncharge && (() => {
        const itemRows = finishedProducts
          .map(({ camelKey, label }) => ({ label, qty: momoQuantities[camelKey] || 0 }))
          .filter(r => r.qty > 0);
        const kitchenUtilEntries = Object.entries(kitchenUtilities);
        const sauceNames = Object.keys(sauces).filter(s => sauces[s]);
        const utilityEntries = Object.entries(utilities);

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-y-auto">
              <div className="bg-gradient-to-r from-orange-600 to-red-600 p-5 text-white rounded-t-2xl">
                <p className="text-xs uppercase tracking-wide text-orange-100 mb-1">Review before submitting</p>
                <h3 className="text-lg font-semibold">
                  {new Date(requestDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                </h3>
                {storeDisplayName && <p className="text-sm text-orange-50 mt-0.5">{storeDisplayName}</p>}
              </div>

              <div className="p-5 space-y-3">
                <div className="rounded-lg border-2 border-teal-100 overflow-hidden">
                  <h4 className="text-sm font-bold text-teal-900 bg-teal-50 px-3 py-2 flex items-center gap-2">
                    <Package className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    Momo Quantities
                  </h4>
                  <div className="p-3 bg-white">
                    {itemRows.length > 0 ? (
                      <div className="space-y-1">
                        {itemRows.map(r => (
                          <div key={r.label} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700">{r.label}</span>
                            <span className="font-semibold text-gray-900">{r.qty}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">None added</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border-2 border-teal-100 overflow-hidden">
                  <h4 className="text-sm font-bold text-teal-900 bg-teal-50 px-3 py-2 flex items-center gap-2">
                    <Package className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    Kitchen Utilities
                  </h4>
                  <div className="p-3 bg-white">
                    {kitchenUtilEntries.length > 0 ? (
                      <div className="space-y-1">
                        {kitchenUtilEntries.map(([name, val]) => (
                          <div key={name} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700">{name}</span>
                            <span className="font-semibold text-gray-900">{val.quantity} {val.unit}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">None added</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border-2 border-rose-100 overflow-hidden">
                  <h4 className="text-sm font-bold text-rose-900 bg-rose-50 px-3 py-2 flex items-center gap-2">
                    <Package className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    Sauces
                  </h4>
                  <div className="p-3 bg-white">
                    {sauceNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {sauceNames.map(s => (
                          <span key={s} className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full text-xs">{s}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">None selected</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border-2 border-blue-100 overflow-hidden">
                  <h4 className="text-sm font-bold text-blue-900 bg-blue-50 px-3 py-2 flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    Utilities
                  </h4>
                  <div className="p-3 bg-white">
                    {utilityEntries.length > 0 ? (
                      <div className="space-y-1">
                        {utilityEntries.map(([name, qty]) => (
                          <div key={name} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700">{name}</span>
                            <span className="font-semibold text-gray-900">{qty} pcs</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">None added</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border-2 border-gray-200 overflow-hidden">
                  <h4 className="text-sm font-bold text-gray-800 bg-gray-50 px-3 py-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    Notes
                  </h4>
                  <div className="p-3 bg-white">
                    <p className="text-sm text-gray-600">{notes || <span className="text-gray-400 italic">No notes added</span>}</p>
                  </div>
                </div>

                <label className="flex items-start gap-3 p-3 bg-gray-50 border-2 border-gray-200 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={submitConfirmChecked}
                    onChange={(e) => setSubmitConfirmChecked(e.target.checked)}
                    className="w-5 h-5 mt-0.5 text-orange-600 rounded focus:ring-orange-500 flex-shrink-0"
                  />
                  <span className="text-sm text-gray-700">I've checked the date and quantities above and they're correct.</span>
                </label>
              </div>

              <div className="p-4 bg-gray-50 rounded-b-2xl flex flex-col sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(false)}
                  className="px-4 py-2.5 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                >
                  Go Back
                </button>
                <button
                  type="button"
                  disabled={!submitConfirmChecked || submitting}
                  onClick={handleConfirmAndSubmit}
                  className="px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-semibold"
                >
                  <CheckCircle className="w-4 h-4" />
                  Confirm & Submit
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Duplicate Same-Date Request Confirmation */}
      {showDuplicateDateConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="bg-amber-500 p-6 text-white rounded-t-2xl flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 flex-shrink-0" />
              <h3 className="text-xl font-bold">Duplicate Request Date</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-700">
                You already have a stock request submitted for{' '}
                <span className="font-semibold">
                  {new Date(requestDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                . Are you sure you want to submit another request for the same date?
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-b-2xl flex flex-col sm:flex-row justify-end gap-2">
              <button
                onClick={() => setShowDuplicateDateConfirm(false)}
                disabled={submitting}
                className="px-4 py-2.5 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={performSubmitRequest}
                disabled={submitting}
                className="px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Yes, Submit Anyway'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plate Configuration Modal */}
      {showPlateConfigModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-stone-800 p-6 text-white rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold mb-2">Plate Configuration</h3>
                  <p className="text-sm text-blue-100">Set how many momos are in each plate</p>
                </div>
                <button
                  onClick={() => setShowPlateConfigModal(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Explanation */}
            <div className="p-6 bg-blue-50 border-b-2 border-blue-200">
              <h3 className="text-gray-900 font-semibold mb-2">How it works:</h3>
              <p className="text-sm text-gray-700">
                Stock will be displayed as both pieces and plates. For example, if you have 170 momos and each plate contains 6 momos, 
                it will show as <span className="font-mono bg-white px-2 py-1 rounded">170 pcs / 28 plates</span>.
              </p>
            </div>

            {/* Input */}
            <div className="p-6">
              <label className="text-gray-900 font-semibold mb-3 block">
                Momos Per Plate
              </label>
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-300 rounded-xl p-4">
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={momosPerPlate}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 6;
                    setMomosPerPlate(value);
                    localStorage.setItem('momosPerPlate', value.toString());
                  }}
                  className="w-full px-4 py-3 border-2 border-blue-400 rounded-lg focus:border-blue-600 focus:outline-none text-center text-2xl font-bold text-blue-900"
                />
                <p className="text-center text-sm text-blue-700 mt-2">pieces per plate</p>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setShowPlateConfigModal(false)}
                className="px-6 py-2.5 bg-stone-800 text-white rounded-xl hover:bg-stone-900 transition-all shadow-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shipping Confirmation Dialog */}
      {showShippingDialog && shippingRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="bg-gradient-to-r from-orange-500 to-rose-500 p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Truck className="w-6 h-6" />
                    Confirm Shipping Details
                  </h2>
                  <p className="text-orange-100 mt-1">
                    Verify quantities and add notes for any changes
                  </p>
                </div>
                <button
                  onClick={() => setShowShippingDialog(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-220px)]">
              <div className="space-y-6">
                {/* Momos - in whole bags, with the batches each type comes from */}
                {finishedProducts.some((p) => p.camelKey in shippedQuantities) && (
                  <ShipDialogBags
                    request={shippingRequest}
                    momoKeys={finishedProducts.map((p) => p.camelKey).filter((k) => k in shippedQuantities)}
                    labels={Object.fromEntries(finishedProducts.map((p) => [p.camelKey, p.label]))}
                    shippedQuantities={shippedQuantities}
                    setShippedQuantities={setShippedQuantities}
                    shippingNotes={shippingNotes}
                    setShippingNotes={setShippingNotes}
                    draft={dispatchDraft}
                    setDraft={setDispatchDraft}
                    productionData={context.productionData || []}
                    allRequests={requests}
                  />
                )}

                {/* Kitchen Utilities Section */}
                {Object.entries(shippedQuantities).filter(([key]) => 
                  key.startsWith('kitchenUtility_')
                ).length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 mb-3">Kitchen Utilities</h3>
                    <div className="space-y-3">
                      {Object.entries(shippedQuantities)
                        .filter(([key]) => key.startsWith('kitchenUtility_'))
                        .map(([key, qty]) => {
                          const utilityName = key.replace('kitchenUtility_', '');
                          const requestedQty = shippingRequest.kitchenUtilities?.[utilityName]?.quantity || 0;
                          const unit = shippingRequest.kitchenUtilities?.[utilityName]?.unit || '';
                          const isDifferent = qty !== requestedQty;
                          
                          return (
                            <div key={key} className={`border rounded-lg p-4 ${isDifferent ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
                              <div className="flex items-start gap-4">
                                <div className="flex-1">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {utilityName}
                                    <span className="ml-2 text-xs text-gray-500">(Requested: {requestedQty} {unit})</span>
                                  </label>
                                  <div className="flex gap-2">
                                    <input
                                      type="number"
                                      min="0"
                                      value={qty}
                                      onChange={(e) => setShippedQuantities({
                                        ...shippedQuantities,
                                        [key]: parseFloat(e.target.value) || 0
                                      })}
                                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                    <span className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                                      {unit}
                                    </span>
                                  </div>
                                </div>
                                {isDifferent && (
                                  <div className="flex-1">
                                    <label className="block text-sm font-medium text-amber-700 mb-1">
                                      Reason for difference *
                                    </label>
                                    <input
                                      type="text"
                                      value={shippingNotes[key] || ''}
                                      onChange={(e) => setShippingNotes({
                                        ...shippingNotes,
                                        [key]: e.target.value
                                      })}
                                      placeholder="e.g., Insufficient stock"
                                      className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Utilities Section */}
                {Object.entries(shippedQuantities).filter(([key]) => 
                  key.startsWith('utility_')
                ).length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 mb-3">Utilities</h3>
                    <div className="space-y-3">
                      {Object.entries(shippedQuantities)
                        .filter(([key]) => key.startsWith('utility_'))
                        .map(([key, qty]) => {
                          const utilityName = key.replace('utility_', '');
                          const requestedQty = shippingRequest.utilities?.[utilityName] || 0;
                          const isDifferent = qty !== requestedQty;
                          
                          return (
                            <div key={key} className={`border rounded-lg p-4 ${isDifferent ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
                              <div className="flex items-start gap-4">
                                <div className="flex-1">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {utilityName}
                                    <span className="ml-2 text-xs text-gray-500">(Requested: {requestedQty} pcs)</span>
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={qty}
                                    onChange={(e) => setShippedQuantities({
                                      ...shippedQuantities,
                                      [key]: parseInt(e.target.value) || 0
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                  />
                                </div>
                                {isDifferent && (
                                  <div className="flex-1">
                                    <label className="block text-sm font-medium text-amber-700 mb-1">
                                      Reason for difference *
                                    </label>
                                    <input
                                      type="text"
                                      value={shippingNotes[key] || ''}
                                      onChange={(e) => setShippingNotes({
                                        ...shippingNotes,
                                        [key]: e.target.value
                                      })}
                                      placeholder="e.g., Insufficient stock"
                                      className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Sauces Section */}
                {shippingRequest.sauces && Object.keys(shippingRequest.sauces).length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 mb-3">Sauces</h3>
                    <p className="text-sm text-gray-500 mb-3">Untick any sauce that could not be included in this shipment - unticking asks why, same as a quantity shortfall above.</p>
                    <div className="space-y-3">
                      {Object.keys(shippingRequest.sauces).map((sauce) => {
                        const isIncluded = shippedSauces[sauce] ?? true;
                        const notesKey = `sauce_${sauce}`;
                        return (
                          <div key={sauce} className={`border rounded-lg p-4 ${!isIncluded ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                            <div className="flex items-start gap-4">
                              <label className="flex items-center gap-2 flex-shrink-0 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isIncluded}
                                  onChange={(e) => setShippedSauces({
                                    ...shippedSauces,
                                    [sauce]: e.target.checked
                                  })}
                                  className="w-4 h-4 text-rose-600 rounded"
                                />
                                <span className={`text-sm font-medium ${isIncluded ? 'text-gray-700' : 'text-red-700'}`}>
                                  {sauce}
                                </span>
                              </label>
                              {!isIncluded && (
                                <div className="flex-1">
                                  <label className="block text-sm font-medium text-red-700 mb-1">
                                    Reason it's not included *
                                  </label>
                                  <input
                                    type="text"
                                    value={shippingNotes[notesKey] || ''}
                                    onChange={(e) => setShippingNotes({
                                      ...shippingNotes,
                                      [notesKey]: e.target.value
                                    })}
                                    placeholder="e.g., Ran out of stock"
                                    className="w-full px-3 py-2 border border-red-300 rounded-lg bg-white"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {isPhase1Live(getTodayIST()) && finishedProducts.some((p) => (shippedQuantities[p.camelKey] || 0) > 0) && (
                  <PackingFields draft={dispatchDraft} setDraft={setDispatchDraft} />
                )}

                {/* Responsibility Checkbox */}
                <div className="border-t border-gray-200 pt-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shippingResponsibility}
                      onChange={(e) => setShippingResponsibility(e.target.checked)}
                      className="mt-1 w-5 h-5 text-orange-600 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">
                      <strong className="text-gray-900">I confirm that I am responsible for shipping these items</strong> and have verified the quantities above. I understand that any discrepancies must be documented with a valid reason.
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-100 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowShippingDialog(false)}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleShipRequest}
                disabled={!shippingResponsibility}
                className="px-6 py-2 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-lg hover:from-orange-600 hover:to-rose-600 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Shipping
              </button>
            </div>
          </div>
        </div>
      )}

      {slipRequest && (
        <DispatchSlipModal request={slipRequest} products={finishedProducts} onClose={() => setSlipRequest(null)} />
      )}

      {receivingRequest && (
        <ReceiveDeliveryDialog
          request={receivingRequest}
          products={finishedProducts}
          accessToken={context.user?.accessToken || ''}
          onClose={() => setReceivingRequest(null)}
          onReceived={async () => {
            setReceivingRequest(null);
            await loadRequests();
          }}
        />
      )}
    </>
  );
}
