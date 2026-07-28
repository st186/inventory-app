import { useState, useMemo, useEffect } from 'react';
import { InventoryContextType } from '../App';
import { DollarSign, TrendingUp, Wallet, Upload, X, CheckCircle, ChevronDown, ChevronUp, AlertCircle, Trash2, FileSpreadsheet } from 'lucide-react';
import * as api from '../utils/api';
import { parseZomatoSettlementFile, parseSwiggySettlementFile, ParsedSettlement } from '../utils/aggregatorSettlementParser';

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  onDataUpdate?: () => void;
};

type FilterPreset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';

function getDateRange(preset: FilterPreset, customStart: string, customEnd: string): { start: string; end: string } {
  const now = new Date();
  const toISO = (d: Date) => d.toISOString().split('T')[0];
  const startOfWeek = (d: Date) => {
    const copy = new Date(d);
    copy.setDate(copy.getDate() - copy.getDay());
    return copy;
  };

  switch (preset) {
    case 'today':
      return { start: toISO(now), end: toISO(now) };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { start: toISO(y), end: toISO(y) };
    }
    case 'this_week':
      return { start: toISO(startOfWeek(now)), end: toISO(now) };
    case 'last_week': {
      const thisWeekStart = startOfWeek(now);
      const lastWeekEnd = new Date(thisWeekStart);
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekStart.getDate() - 6);
      return { start: toISO(lastWeekStart), end: toISO(lastWeekEnd) };
    }
    case 'this_month':
      return { start: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), end: toISO(now) };
    case 'last_month':
      return {
        start: toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        end: toISO(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'custom':
      return { start: customStart, end: customEnd };
  }
}

const FILTER_OPTIONS: [FilterPreset, string][] = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['this_week', 'This Week'],
  ['last_week', 'Last Week'],
  ['this_month', 'This Month'],
  ['last_month', 'Last Month'],
  ['custom', 'Custom'],
];

export function OnlineSalesTab({ context, selectedStoreId }: Props) {
  const [settlements, setSettlements] = useState<api.AggregatorSettlement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadAggregator, setUploadAggregator] = useState<'zomato' | 'swiggy'>('zomato');
  const [parsedSettlements, setParsedSettlements] = useState<ParsedSettlement[] | null>(null);
  const [sourceFileName, setSourceFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const effectiveStoreId = selectedStoreId || context.user?.storeId;
  // Payout/commission reconciliation is an operations-manager responsibility, not the store incharge's -
  // it reveals aggregator commission structure that the store incharge shouldn't need to see.
  const canEdit =
    (context.user?.role === 'manager' && context.user?.designation !== 'store_incharge' && context.user?.designation !== 'production_incharge') ||
    context.user?.role === 'cluster_head';

  const loadSettlements = async () => {
    if (!context.user?.accessToken) return;
    setIsLoading(true);
    try {
      const storeIdParam = (!effectiveStoreId || effectiveStoreId === 'all') ? undefined : effectiveStoreId;
      const data = await api.getAggregatorSettlements(context.user.accessToken, storeIdParam);
      setSettlements(data);
    } catch (error) {
      console.error('Error loading aggregator settlements:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettlements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.user?.accessToken, effectiveStoreId]);

  const cumulativeStats = useMemo(() => {
    const totalSales = settlements.reduce((sum, s) => sum + s.grossSales, 0);
    const totalPayouts = settlements.reduce((sum, s) => sum + s.netPayout, 0);
    const totalCommission = settlements.reduce((sum, s) => sum + s.netCommission, 0);
    return { totalSales, totalPayouts, totalCommission };
  }, [settlements]);

  const handleFileSelected = async (file: File) => {
    setParseError(null);
    setParsedSettlements(null);
    setSourceFileName(file.name);
    setIsParsing(true);
    try {
      const parsed = uploadAggregator === 'zomato'
        ? await parseZomatoSettlementFile(file)
        : await parseSwiggySettlementFile(file);
      setParsedSettlements(parsed);
    } catch (error: any) {
      setParseError(error?.message || 'Failed to parse this file');
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirmSave = async () => {
    if (!context.user?.accessToken || !parsedSettlements || !effectiveStoreId) return;
    const store = context.stores?.find(s => s.id === effectiveStoreId);
    setIsSaving(true);
    try {
      for (const settlement of parsedSettlements) {
        await api.createAggregatorSettlement(context.user.accessToken, {
          storeId: effectiveStoreId,
          storeName: store?.name || '',
          aggregator: settlement.aggregator,
          settlementDate: settlement.settlementDate,
          bankUTR: settlement.bankUTR,
          grossSales: settlement.grossSales,
          netPayout: settlement.netPayout,
          netCommission: settlement.netCommission,
          orderCount: settlement.orderCount,
          sourceFileName,
        });
      }
      await loadSettlements();
      if (context.refreshData) await context.refreshData();
      setShowUploadModal(false);
      setParsedSettlements(null);
      setSourceFileName('');
    } catch (error: any) {
      setParseError(error?.message || 'Failed to save settlement(s)');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!context.user?.accessToken) return;
    if (!confirm('Delete this settlement? This will reduce Online Cash in Hand (Paytm) for its settlement date.')) return;
    setDeletingId(id);
    try {
      await api.deleteAggregatorSettlement(context.user.accessToken, id);
      await loadSettlements();
      if (context.refreshData) await context.refreshData();
    } catch (error: any) {
      alert(error?.message || 'Failed to delete settlement');
    } finally {
      setDeletingId(null);
    }
  };

  const { start: filterStart, end: filterEnd } = getDateRange(filterPreset, customStart, customEnd);
  const filteredSettlements = settlements
    .filter(s => !filterStart || !filterEnd || (s.settlementDate >= filterStart && s.settlementDate <= filterEnd))
    .sort((a, b) => b.settlementDate.localeCompare(a.settlementDate));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-50 to-rose-50 rounded-lg p-6 border border-orange-200">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              Aggregator Payout Reconciliation (Swiggy & Zomato)
            </h2>
            <p className="text-gray-600 text-sm">
              Upload each settlement report as it's downloaded from Swiggy/Zomato - net payout, gross sales, and
              commission are computed automatically, and the net payout is credited to Online Cash in Hand (Paytm)
              on that settlement's own date.
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => { setShowUploadModal(true); setParsedSettlements(null); setParseError(null); }}
              className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg font-semibold hover:from-orange-700 hover:to-red-700 transition-all shadow-lg"
            >
              <Upload className="w-4 h-4" />
              Upload Settlement
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-6 border-2 border-green-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Gross Sales (All Settlements)</span>
            <DollarSign className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-600">₹{cumulativeStats.totalSales.toFixed(2)}</p>
        </div>

        <div className="bg-white rounded-lg p-6 border-2 border-blue-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Net Payout (All Settlements)</span>
            <Wallet className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-blue-600">₹{cumulativeStats.totalPayouts.toFixed(2)}</p>
        </div>

        <div className="bg-white rounded-lg p-6 border-2 border-orange-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Net Commission (All Settlements)</span>
            <TrendingUp className="w-5 h-5 text-orange-600" />
          </div>
          <p className="text-2xl font-bold text-orange-600">₹{cumulativeStats.totalCommission.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">Gross Sales - Net Payout</p>
        </div>
      </div>

      {/* Settlement History - collapsible, date-filtered */}
      <div className="bg-white rounded-lg border-2 border-orange-200 shadow-lg">
        <button
          onClick={() => setIsHistoryOpen(!isHistoryOpen)}
          className="w-full flex items-center justify-between p-6 text-left"
        >
          <h3 className="text-lg font-semibold text-gray-800">Settlement History</h3>
          {isHistoryOpen ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
        </button>

        {isHistoryOpen && (
          <div className="px-6 pb-6">
            <div className="flex flex-wrap gap-2 mb-4">
              {FILTER_OPTIONS.map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilterPreset(value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filterPreset === value ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {filterPreset === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
                <span className="text-gray-500 text-sm">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-400 text-sm">Loading settlements...</div>
            ) : filteredSettlements.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">No settlements in this date range</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Settlement Date</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Aggregator</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Orders</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Gross Sales</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Net Payout</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Commission</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Bank UTR</th>
                      {canEdit && <th className="text-right py-3 px-4 font-semibold text-gray-700"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSettlements.map(s => (
                      <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-700">
                          {new Date(s.settlementDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="py-3 px-4 text-gray-700 capitalize">{s.aggregator}</td>
                        <td className="py-3 px-4 text-right text-gray-700">{s.orderCount}</td>
                        <td className="py-3 px-4 text-right text-gray-700">₹{s.grossSales.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-semibold text-blue-600">₹{s.netPayout.toFixed(2)}</td>
                        <td className={`py-3 px-4 text-right font-semibold ${s.netCommission >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
                          ₹{s.netCommission.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-gray-500 text-xs">{s.bankUTR}</td>
                        {canEdit && (
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleDelete(s.id)}
                              disabled={deletingId === s.id}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                              title="Delete settlement"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Upload Settlement Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setShowUploadModal(false)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-6 text-white">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5" />
                  Upload Settlement Report
                </h2>
                <button onClick={() => setShowUploadModal(false)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Aggregator</label>
                <div className="flex gap-2">
                  {(['zomato', 'swiggy'] as const).map(agg => (
                    <button
                      key={agg}
                      onClick={() => { setUploadAggregator(agg); setParsedSettlements(null); setParseError(null); }}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                        uploadAggregator === agg ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {agg}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Settlement File (.xlsx)</label>
                <label className="flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-orange-400 hover:bg-orange-50/50 transition-colors">
                  <Upload className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-600">{sourceFileName || 'Click to choose the settlement report'}</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }}
                  />
                </label>
              </div>

              {isParsing && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                  Parsing file...
                </div>
              )}

              {parseError && (
                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-800">{parseError}</p>
                </div>
              )}

              {parsedSettlements && parsedSettlements.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-700">
                    Found {parsedSettlements.length} settlement{parsedSettlements.length !== 1 ? 's' : ''} - review before saving:
                  </p>
                  {parsedSettlements.map((s, i) => (
                    <div key={i} className="bg-orange-50 border-2 border-orange-200 rounded-lg p-4 space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Settlement Date</span>
                        <span className="font-medium text-gray-900">{new Date(s.settlementDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Bank UTR</span>
                        <span className="font-medium text-gray-900">{s.bankUTR || '-'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Orders</span>
                        <span className="font-medium text-gray-900">{s.orderCount}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Gross Sales</span>
                        <span className="font-medium text-gray-900">₹{s.grossSales.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Net Payout</span>
                        <span className="font-semibold text-blue-700">₹{s.netPayout.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm pt-1.5 border-t border-orange-200">
                        <span className="text-gray-600">Net Commission</span>
                        <span className={`font-semibold ${s.netCommission >= 0 ? 'text-orange-700' : 'text-red-700'}`}>₹{s.netCommission.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSave}
                  disabled={!parsedSettlements || parsedSettlements.length === 0 || isSaving}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg font-medium hover:from-orange-700 hover:to-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Confirm & Save
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
