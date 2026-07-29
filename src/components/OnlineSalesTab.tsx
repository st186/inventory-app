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

const FILTER_LABELS: Record<FilterPreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This Week',
  last_week: 'Last Week',
  this_month: 'This Month',
  last_month: 'Last Month',
  custom: 'Custom Range',
};

export function OnlineSalesTab({ context, selectedStoreId }: Props) {
  const [settlements, setSettlements] = useState<api.AggregatorSettlement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadAggregator, setUploadAggregator] = useState<'zomato' | 'swiggy'>('zomato');
  const [parsedSettlements, setParsedSettlements] = useState<(ParsedSettlement & { sourceFileName: string })[] | null>(null);
  const [parseErrors, setParseErrors] = useState<{ fileName: string; message: string }[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [skippedDuplicates, setSkippedDuplicates] = useState<{ fileName: string; settlementDate: string }[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('this_month');
  // Custom range only actually applies once "Apply" is pressed - draft* holds what's
  // typed into the date inputs, appliedCustomStart/End is what filtering uses.
  const [draftCustomStart, setDraftCustomStart] = useState('');
  const [draftCustomEnd, setDraftCustomEnd] = useState('');
  const [appliedCustomStart, setAppliedCustomStart] = useState('');
  const [appliedCustomEnd, setAppliedCustomEnd] = useState('');
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


  // A settlement's real identity - same aggregator, same settlement date, same bank UTR -
  // used to catch the same file (or an overlapping settlement period) being uploaded twice.
  const settlementKey = (s: { aggregator: string; settlementDate: string; bankUTR: string }) =>
    `${s.aggregator}|${s.settlementDate}|${s.bankUTR}`;

  const handleFilesSelected = async (files: File[]) => {
    setSaveError(null);
    setParseErrors([]);
    setSkippedDuplicates([]);
    setIsParsing(true);
    const newSettlements: (ParsedSettlement & { sourceFileName: string })[] = [];
    const errors: { fileName: string; message: string }[] = [];
    const duplicates: { fileName: string; settlementDate: string }[] = [];

    // Already-saved settlements for this store, plus whatever's already queued in this
    // modal session - anything matching one of these keys is a duplicate, not a new upload.
    const existingKeys = new Set(settlements.map(settlementKey));
    (parsedSettlements || []).forEach(s => existingKeys.add(settlementKey(s)));

    for (const file of files) {
      try {
        const parsed = uploadAggregator === 'zomato'
          ? await parseZomatoSettlementFile(file)
          : await parseSwiggySettlementFile(file);
        for (const s of parsed) {
          const key = settlementKey(s);
          if (existingKeys.has(key)) {
            duplicates.push({ fileName: file.name, settlementDate: s.settlementDate });
            continue;
          }
          existingKeys.add(key); // also catches duplicates within this same batch of files
          newSettlements.push({ ...s, sourceFileName: file.name });
        }
      } catch (error: any) {
        errors.push({ fileName: file.name, message: error?.message || 'Failed to parse this file' });
      }
    }

    // Append to whatever's already been parsed this session, so picking another batch of
    // files doesn't discard settlements already queued up for review.
    setParsedSettlements(prev => [...(prev || []), ...newSettlements]);
    setParseErrors(prev => [...prev, ...errors]);
    setSkippedDuplicates(prev => [...prev, ...duplicates]);
    setIsParsing(false);
  };

  const handleConfirmSave = async () => {
    if (!context.user?.accessToken || !parsedSettlements || !effectiveStoreId) return;
    const store = context.stores?.find(s => s.id === effectiveStoreId);
    setIsSaving(true);
    // Save each settlement independently - a rejected duplicate (the server's own
    // safety-net check) shouldn't also block every other settlement in the same batch.
    const failures: string[] = [];
    const stillPending: typeof parsedSettlements = [];
    for (const settlement of parsedSettlements) {
      try {
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
          sourceFileName: settlement.sourceFileName,
        });
      } catch (error: any) {
        failures.push(`${settlement.sourceFileName} (${settlement.settlementDate}): ${error?.message || 'failed to save'}`);
        stillPending.push(settlement);
      }
    }

    await loadSettlements();
    if (context.refreshData) await context.refreshData();

    if (failures.length === 0) {
      setShowUploadModal(false);
      setParsedSettlements(null);
      setParseErrors([]);
    } else {
      // Only the ones that failed stay queued - already-saved settlements shouldn't be
      // offered for a retry, which would just trigger the duplicate check again.
      setParsedSettlements(stillPending);
      setSaveError(`${failures.length} settlement(s) couldn't be saved:\n${failures.join('\n')}`);
    }
    setIsSaving(false);
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

  const { start: filterStart, end: filterEnd } = getDateRange(filterPreset, appliedCustomStart, appliedCustomEnd);
  // In custom mode, until "Apply" is pressed there's no range yet - show nothing rather
  // than silently falling back to "all settlements", which would look like the filter
  // isn't doing anything.
  const hasActiveRange = filterPreset !== 'custom' || (!!appliedCustomStart && !!appliedCustomEnd);
  const filteredSettlements = hasActiveRange
    ? settlements
        .filter(s => s.settlementDate >= filterStart && s.settlementDate <= filterEnd)
        .sort((a, b) => b.settlementDate.localeCompare(a.settlementDate))
    : [];

  const filteredStats = useMemo(() => {
    const totalSales = filteredSettlements.reduce((sum, s) => sum + s.grossSales, 0);
    const totalPayouts = filteredSettlements.reduce((sum, s) => sum + s.netPayout, 0);
    const totalCommission = filteredSettlements.reduce((sum, s) => sum + s.netCommission, 0);
    return { totalSales, totalPayouts, totalCommission };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlements, filterPreset, appliedCustomStart, appliedCustomEnd]);

  const byAggregator = useMemo(() => {
    const build = (aggregator: 'zomato' | 'swiggy') => {
      const rows = filteredSettlements.filter(s => s.aggregator === aggregator);
      const orders = rows.reduce((sum, s) => sum + s.orderCount, 0);
      const grossSales = rows.reduce((sum, s) => sum + s.grossSales, 0);
      const netPayout = rows.reduce((sum, s) => sum + s.netPayout, 0);
      const netCommission = rows.reduce((sum, s) => sum + s.netCommission, 0);
      const commissionPct = grossSales > 0 ? (netCommission / grossSales) * 100 : 0;
      return { orders, grossSales, netPayout, netCommission, commissionPct };
    };
    return { zomato: build('zomato'), swiggy: build('swiggy') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlements, filterPreset, appliedCustomStart, appliedCustomEnd]);

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
              onClick={() => { setShowUploadModal(true); setParsedSettlements(null); setParseErrors([]); setSaveError(null); setSkippedDuplicates([]); }}
              className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg font-semibold hover:from-orange-700 hover:to-red-700 transition-all shadow-lg"
            >
              <Upload className="w-4 h-4" />
              Upload Settlement
            </button>
          )}
        </div>
      </div>

      {/* Date filter - applies to both the summary cards and the settlement history below */}
      <div className="bg-white rounded-lg p-4 border-2 border-orange-200 shadow-sm">
        <div className="flex flex-wrap gap-2">
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
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <input
              type="date"
              value={draftCustomStart}
              onChange={(e) => setDraftCustomStart(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
            <span className="text-gray-500 text-sm">to</span>
            <input
              type="date"
              value={draftCustomEnd}
              onChange={(e) => setDraftCustomEnd(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
            <button
              onClick={() => { setAppliedCustomStart(draftCustomStart); setAppliedCustomEnd(draftCustomEnd); }}
              disabled={!draftCustomStart || !draftCustomEnd}
              className="px-4 py-1.5 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply
            </button>
            {!appliedCustomStart && (
              <span className="text-xs text-gray-400">Pick both dates and press Apply</span>
            )}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-6 border-2 border-green-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Gross Sales ({FILTER_LABELS[filterPreset]})</span>
            <DollarSign className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-600">₹{filteredStats.totalSales.toFixed(2)}</p>
        </div>

        <div className="bg-white rounded-lg p-6 border-2 border-blue-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Net Payout ({FILTER_LABELS[filterPreset]})</span>
            <Wallet className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-blue-600">₹{filteredStats.totalPayouts.toFixed(2)}</p>
        </div>

        <div className="bg-white rounded-lg p-6 border-2 border-orange-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Net Commission ({FILTER_LABELS[filterPreset]})</span>
            <TrendingUp className="w-5 h-5 text-orange-600" />
          </div>
          <p className="text-2xl font-bold text-orange-600">₹{filteredStats.totalCommission.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">Gross Sales - Net Payout</p>
        </div>
      </div>

      {/* Per-aggregator breakdown - same date filter as the summary cards above */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(['zomato', 'swiggy'] as const).map(agg => {
          const stats = byAggregator[agg];
          return (
            <div key={agg} className={`bg-white rounded-lg p-5 border-2 shadow-sm ${agg === 'zomato' ? 'border-red-200' : 'border-orange-200'}`}>
              <h3 className="text-base font-semibold text-gray-800 capitalize mb-3">{agg} ({FILTER_LABELS[filterPreset]})</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Orders</p>
                  <p className="text-lg font-semibold text-gray-900">{stats.orders}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Gross Sales</p>
                  <p className="text-lg font-semibold text-gray-900">₹{stats.grossSales.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Net Payout</p>
                  <p className="text-lg font-semibold text-blue-600">₹{stats.netPayout.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Net Commission</p>
                  <p className={`text-lg font-semibold ${stats.netCommission >= 0 ? 'text-orange-600' : 'text-red-600'}`}>₹{stats.netCommission.toFixed(2)}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">Net Commission %</span>
                <span className={`text-sm font-semibold ${stats.commissionPct >= 0 ? 'text-orange-600' : 'text-red-600'}`}>{stats.commissionPct.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Settlement History - collapsible, uses the date filter above */}
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
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-400 text-sm">Loading settlements...</div>
            ) : !hasActiveRange ? (
              <div className="py-8 text-center text-sm text-gray-500">Pick a custom date range and press Apply above</div>
            ) : filteredSettlements.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">No settlements in this date range yet - use "Upload Settlement" above to add one</div>
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
                      onClick={() => { setUploadAggregator(agg); setParsedSettlements(null); setParseErrors([]); setSaveError(null); setSkippedDuplicates([]); }}
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
                <label className="block text-sm font-semibold text-gray-700 mb-2">Settlement File(s) (.xlsx)</label>
                <label className="flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-orange-400 hover:bg-orange-50/50 transition-colors">
                  <Upload className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {parsedSettlements && parsedSettlements.length > 0
                      ? `${new Set(parsedSettlements.map(s => s.sourceFileName)).size} file(s) parsed - click to add more`
                      : 'Click to choose one or more settlement reports'}
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) handleFilesSelected(files);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>

              {isParsing && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                  Parsing file(s)...
                </div>
              )}

              {parseErrors.length > 0 && (
                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 space-y-1.5">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                    <p className="text-sm font-semibold text-red-800">
                      {parseErrors.length} file{parseErrors.length !== 1 ? 's' : ''} couldn't be parsed:
                    </p>
                  </div>
                  <ul className="text-sm text-red-800 list-disc list-inside pl-8">
                    {parseErrors.map((e, i) => (
                      <li key={i}><span className="font-medium">{e.fileName}</span>: {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {saveError && (
                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-800 whitespace-pre-line">{saveError}</p>
                </div>
              )}

              {skippedDuplicates.length > 0 && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4 space-y-1.5">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <p className="text-sm font-semibold text-amber-800">
                      {skippedDuplicates.length} duplicate settlement{skippedDuplicates.length !== 1 ? 's' : ''} skipped (already saved or already queued):
                    </p>
                  </div>
                  <ul className="text-sm text-amber-800 list-disc list-inside pl-8">
                    {skippedDuplicates.map((d, i) => (
                      <li key={i}><span className="font-medium">{d.fileName}</span> - settlement date {new Date(d.settlementDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</li>
                    ))}
                  </ul>
                </div>
              )}

              {parsedSettlements && parsedSettlements.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-700">
                    Found {parsedSettlements.length} settlement{parsedSettlements.length !== 1 ? 's' : ''} from {new Set(parsedSettlements.map(s => s.sourceFileName)).size} file(s) - review before saving:
                  </p>
                  {parsedSettlements.map((s, i) => (
                    <div key={i} className="bg-orange-50 border-2 border-orange-200 rounded-lg p-4 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs text-gray-500 truncate">{s.sourceFileName}</span>
                        <button
                          onClick={() => setParsedSettlements(prev => (prev || []).filter((_, idx) => idx !== i))}
                          className="p-1 text-gray-400 hover:text-red-600 rounded flex-shrink-0"
                          title="Remove this settlement from the queue"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
