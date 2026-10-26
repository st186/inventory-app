import { useState, useMemo, useEffect } from 'react';
import { InventoryContextType } from '../App';
import { DollarSign, TrendingUp, TrendingDown, Wallet, Upload, X, CheckCircle, ChevronDown, ChevronUp, AlertCircle, Trash2, FileSpreadsheet, BarChart3 } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import * as api from '../utils/api';
import { parseZomatoSettlementFile, parseSwiggySettlementFile, ParsedSettlement } from '../utils/aggregatorSettlementParser';
import { getSettlementPeriod, settlementOverlapsPeriod } from '../utils/settlementPeriod';
import { getTodayIST, addDays } from '../utils/timezone';

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  onDataUpdate?: () => void;
};

type FilterPreset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';

function getDateRange(preset: FilterPreset, customStart: string, customEnd: string): { start: string; end: string } {
  // All arithmetic is done on IST calendar-date strings (via getTodayIST/addDays) rather
  // than raw Date objects + toISOString(), which silently rolls the date back a day for
  // anyone in IST between midnight and 5:30am (UTC is still "yesterday" at that point).
  const today = getTodayIST();
  const dayOfWeek = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  };
  const startOfWeek = (dateStr: string) => addDays(dateStr, -dayOfWeek(dateStr));

  switch (preset) {
    case 'today':
      return { start: today, end: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { start: y, end: y };
    }
    case 'this_week':
      return { start: startOfWeek(today), end: today };
    case 'last_week': {
      const thisWeekStart = startOfWeek(today);
      const lastWeekEnd = addDays(thisWeekStart, -1);
      const lastWeekStart = addDays(lastWeekEnd, -6);
      return { start: lastWeekStart, end: lastWeekEnd };
    }
    case 'this_month':
      return { start: `${today.slice(0, 7)}-01`, end: today };
    case 'last_month': {
      const lastMonthEnd = addDays(`${today.slice(0, 7)}-01`, -1); // last day of previous month
      const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01`;
      return { start: lastMonthStart, end: lastMonthEnd };
    }
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

type SettlementPeriodLike = {
  settlementDate: string;
  periodStart?: string;
  periodEnd?: string;
  sourceFileName?: string;
  orders?: { orderDate?: string }[];
};

const settlementPeriodStart = (s: SettlementPeriodLike) => getSettlementPeriod(s).start;
const settlementPeriodEnd = (s: SettlementPeriodLike) => getSettlementPeriod(s).end;
const formatDateIN = (date: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(date).toLocaleDateString('en-IN', opts);
const formatSettlementPeriod = (s: SettlementPeriodLike) => {
  const { start, end } = getSettlementPeriod(s);
  if (start === end) return formatDateIN(start);
  return `${formatDateIN(start)} - ${formatDateIN(end)}`;
};

export function OnlineSalesTab({ context, selectedStoreId }: Props) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadAggregator, setUploadAggregator] = useState<'zomato' | 'swiggy'>('zomato');
  const [parsedSettlements, setParsedSettlements] = useState<(ParsedSettlement & { sourceFileName: string; replacesId?: string })[] | null>(null);
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
  const [uploadStoreId, setUploadStoreId] = useState('');
  // Per-order item detail (moved here from Analytics.tsx's "Revenue & Channels" tab) and the
  // menu item price catalog - together power the Channel Economics comparison below. Fetched
  // independently of the settlements themselves since they come from a different sync path
  // (Ciferon's per-order OrderReport, not the settlement file upload).
  const [orderItemDetail, setOrderItemDetail] = useState<api.OrderItemDetailRecord[]>([]);
  const [menuItemPrices, setMenuItemPrices] = useState<api.MenuItemPrice[]>([]);
  // Channel Economics works for either aggregator; the settlement file's order ids join to the POS
  // orders' external ids the same way for both.
  const [econPlatform, setEconPlatform] = useState<'zomato' | 'swiggy'>('zomato');
  // The last ~2 months of POS orders, fetched regardless of the selected date range, only to find each
  // dish's NEWEST price at the counter (see latestCounterPrices below).
  const [priceDiscoveryDetail, setPriceDiscoveryDetail] = useState<api.OrderItemDetailRecord[]>([]);

  const concreteSelectedStoreId = selectedStoreId && selectedStoreId !== 'all' ? selectedStoreId : null;
  const userConcreteStoreId = context.user?.storeId && context.user.storeId !== 'all' ? context.user.storeId : null;
  const effectiveStoreId = concreteSelectedStoreId || userConcreteStoreId || null;
  const defaultUploadStoreId = effectiveStoreId || '';
  const availableStores = context.stores || [];
  // Payout/commission reconciliation is an operations-manager responsibility, not the store incharge's -
  // it reveals aggregator commission structure that the store incharge shouldn't need to see.
  const canEdit =
    (context.user?.role === 'manager' && context.user?.designation !== 'store_incharge' && context.user?.designation !== 'production_incharge') ||
    context.user?.role === 'cluster_head';

  // Settlements now come from shared context (see the Analytics page redesign) instead of
  // an independent fetch - scope to this store client-side the same way the server-side
  // `storeIdParam` used to.
  const settlements = useMemo(
    () => (!effectiveStoreId || effectiveStoreId === 'all')
      ? context.aggregatorSettlements
      : context.aggregatorSettlements.filter(s => s.storeId === effectiveStoreId),
    [context.aggregatorSettlements, effectiveStoreId]
  );

  // A settlement's real identity - same aggregator, same settlement date - used to catch
  // the same file (or an overlapping settlement period) being uploaded twice. Deliberately
  // does NOT include bankUTR: two uploads for the same date with a blank or differently-
  // parsed UTR (the parser doesn't always capture one cleanly, and a corrected re-upload can
  // easily land with a different value) used to slide past this as "not a duplicate" and
  // create two settlement records for one date, silently double-crediting that day's Paytm
  // balance - confirmed as the root cause of a real double-count found 2026-08-26. Matches
  // the backend's own tightened duplicate check (see the aggregator-settlement POST route).
  const settlementKey = (s: { aggregator: string; settlementDate: string }) =>
    `${s.aggregator}|${s.settlementDate}`;

  const handleFilesSelected = async (files: File[]) => {
    setSaveError(null);
    setParseErrors([]);
    setSkippedDuplicates([]);
    setIsParsing(true);
    const newSettlements: (ParsedSettlement & { sourceFileName: string; replacesId?: string })[] = [];
    const errors: { fileName: string; message: string }[] = [];
    // Only a genuine repeat within THIS session (the exact same file, or two files with the
    // same settlement, queued together) gets skipped outright - a match against an
    // already-saved settlement is offered as a replacement instead, since the whole point of
    // re-uploading is usually to pick up a parser fix (like when adSpend was added).
    const duplicates: { fileName: string; settlementDate: string }[] = [];

    const existingByKey = new Map(settlements.map(s => [settlementKey(s), s]));
    const queuedKeys = new Set((parsedSettlements || []).map(settlementKey));

    for (const file of files) {
      try {
        const parsed = uploadAggregator === 'zomato'
          ? await parseZomatoSettlementFile(file)
          : await parseSwiggySettlementFile(file);
        for (const s of parsed) {
          const key = settlementKey(s);
          if (queuedKeys.has(key)) {
            duplicates.push({ fileName: file.name, settlementDate: s.settlementDate });
            continue;
          }
          queuedKeys.add(key); // also catches duplicates within this same batch of files
          const existing = existingByKey.get(key);
          newSettlements.push({ ...s, sourceFileName: file.name, replacesId: existing?.id });
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
    if (!context.user?.accessToken || !parsedSettlements) return;
    const targetStoreId = defaultUploadStoreId || uploadStoreId;
    if (!targetStoreId || targetStoreId === 'all') {
      setSaveError('Select the store this settlement belongs to before saving.');
      return;
    }
    const store = availableStores.find(s => s.id === targetStoreId);
    if (!store) {
      setSaveError('Selected store was not found. Refresh the page and try again.');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    // Save each settlement independently - a rejected duplicate (the server's own
    // safety-net check) shouldn't also block every other settlement in the same batch.
    const failures: string[] = [];
    const stillPending: typeof parsedSettlements = [];
    for (const settlement of parsedSettlements) {
      try {
        await api.createAggregatorSettlement(context.user.accessToken, {
          storeId: targetStoreId,
          storeName: store?.name || '',
          aggregator: settlement.aggregator,
          settlementDate: settlement.settlementDate,
          periodStart: settlement.periodStart,
          periodEnd: settlement.periodEnd,
          bankUTR: settlement.bankUTR,
          grossSales: settlement.grossSales,
          netPayout: settlement.netPayout,
          netCommission: settlement.netCommission,
          orderCount: settlement.orderCount,
          orders: settlement.orders,
          adSpend: settlement.adSpend,
          itemSubtotal: settlement.itemSubtotal,
          promoDiscount: settlement.promoDiscount,
          flatOffDiscount: settlement.flatOffDiscount,
          totalDiscount: settlement.totalDiscount,
          gstCollected: settlement.gstCollected,
          sourceFileName: settlement.sourceFileName,
          replace: !!settlement.replacesId,
        });
      } catch (error: any) {
        failures.push(`${settlement.sourceFileName} (${settlement.settlementDate}): ${error?.message || 'failed to save'}`);
        stillPending.push(settlement);
      }
    }

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
        .filter(s => settlementOverlapsPeriod(s, filterStart, filterEnd))
        .sort((a, b) =>
          settlementPeriodEnd(b).localeCompare(settlementPeriodEnd(a)) ||
          b.settlementDate.localeCompare(a.settlementDate)
        )
    : [];

  // Menu item price catalog - not date-ranged (it's a catalog, not a transaction log), so
  // fetched once per session, same as Analytics.tsx used to.
  useEffect(() => {
    if (!context.user?.accessToken) return;
    const accessToken = context.user.accessToken;
    let cancelled = false;
    (async () => {
      try {
        const items = await api.getMenuItemPrices(accessToken);
        if (!cancelled) setMenuItemPrices(items || []);
      } catch (err) {
        console.error('Failed to load menu item prices for Channel Economics:', err);
        if (!cancelled) setMenuItemPrices([]);
      }
    })();
    return () => { cancelled = true; };
  }, [context.user?.accessToken]);

  // Per-order item detail for the currently selected date range - powers Channel Economics'
  // order-to-item join below.
  useEffect(() => {
    if (!context.user?.accessToken || !hasActiveRange) return;
    const accessToken = context.user.accessToken;
    let cancelled = false;
    (async () => {
      try {
        const records = await api.getOrderItemDetail(accessToken, {
          storeId: effectiveStoreId || undefined,
          startDate: filterStart,
          endDate: filterEnd,
        });
        if (!cancelled) setOrderItemDetail(records || []);
      } catch (err) {
        console.error('Failed to load order item detail for Channel Economics:', err);
        if (!cancelled) setOrderItemDetail([]);
      }
    })();
    return () => { cancelled = true; };
  }, [context.user?.accessToken, effectiveStoreId, filterStart, filterEnd, hasActiveRange]);

  // Newest counter prices: look back ~60 days (not just the selected range) so a recent price increase
  // is picked up even when the period being analysed is older or shorter than the change.
  useEffect(() => {
    if (!context.user?.accessToken) return;
    const accessToken = context.user.accessToken;
    let cancelled = false;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const from = new Date(`${today}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - 60);
    (async () => {
      try {
        const records = await api.getOrderItemDetail(accessToken, {
          storeId: effectiveStoreId || undefined,
          startDate: from.toISOString().substring(0, 10),
          endDate: today,
        });
        if (!cancelled) setPriceDiscoveryDetail(records || []);
      } catch (err) {
        console.error('Failed to load recent orders for counter price discovery:', err);
        if (!cancelled) setPriceDiscoveryDetail([]);
      }
    })();
    return () => { cancelled = true; };
  }, [context.user?.accessToken, effectiveStoreId]);

  const filteredStats = useMemo(() => {
    const totalSales = filteredSettlements.reduce((sum, s) => sum + s.grossSales, 0);
    const totalPayouts = filteredSettlements.reduce((sum, s) => sum + s.netPayout, 0);
    const totalCommission = filteredSettlements.reduce((sum, s) => sum + s.netCommission, 0);
    const totalAdSpend = filteredSettlements.reduce((sum, s) => sum + (s.adSpend || 0), 0);
    return { totalSales, totalPayouts, totalCommission, totalAdSpend };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlements, filterPreset, appliedCustomStart, appliedCustomEnd]);

  // Zomato-only discount trend, from the settlement file's own promo/flat-off breakdown
  // (see aggregatorSettlementParser.ts) - moved here from Analytics so it sits right next
  // to the settlements it's derived from, using this page's own store/date-range filter
  // instead of a separate one. Settlements uploaded before this field existed simply have
  // itemSubtotal undefined and are excluded, not shown as a false zero.
  const discountChartData = useMemo(() => {
    const zomatoWithDiscount = filteredSettlements.filter(s => s.aggregator === 'zomato' && s.itemSubtotal !== undefined);
    const byDate: Record<string, { itemSubtotal: number; promoDiscount: number; flatOffDiscount: number }> = {};
    zomatoWithDiscount.forEach(s => {
      const date = s.settlementDate;
      if (!byDate[date]) byDate[date] = { itemSubtotal: 0, promoDiscount: 0, flatOffDiscount: 0 };
      byDate[date].itemSubtotal += s.itemSubtotal || 0;
      byDate[date].promoDiscount += s.promoDiscount || 0;
      byDate[date].flatOffDiscount += s.flatOffDiscount || 0;
    });
    return Object.keys(byDate).sort().map(date => {
      const row = byDate[date];
      const totalDiscount = row.promoDiscount + row.flatOffDiscount;
      return {
        date,
        period: formatDateIN(date, { day: 'numeric', month: 'short' }),
        discountPct: row.itemSubtotal > 0 ? Math.round((totalDiscount / row.itemSubtotal) * 1000) / 10 : 0,
        promoDiscount: Math.round(row.promoDiscount),
        flatOffDiscount: Math.round(row.flatOffDiscount),
      };
    });
  }, [filteredSettlements]);

  const byAggregator = useMemo(() => {
    const build = (aggregator: 'zomato' | 'swiggy') => {
      const rows = filteredSettlements.filter(s => s.aggregator === aggregator);
      const orders = rows.reduce((sum, s) => sum + s.orderCount, 0);
      const grossSales = rows.reduce((sum, s) => sum + s.grossSales, 0);
      const netPayout = rows.reduce((sum, s) => sum + s.netPayout, 0);
      const netCommission = rows.reduce((sum, s) => sum + s.netCommission, 0);
      const adSpend = rows.reduce((sum, s) => sum + (s.adSpend || 0), 0);
      const commissionPct = grossSales > 0 ? (netCommission / grossSales) * 100 : 0;
      // Items Total/Discounts/GST only exist on settlements that carry the item-level
      // breakdown (Zomato only, and only settlements uploaded after that field existed -
      // see aggregatorSettlementParser.ts). hasItemData gates whether these are shown at
      // all, rather than silently rendering a partial/misleading sum as if it were complete.
      const rowsWithItemData = rows.filter(s => s.itemSubtotal !== undefined);
      const hasItemData = rowsWithItemData.length > 0;
      const itemSubtotal = rowsWithItemData.reduce((sum, s) => sum + (s.itemSubtotal || 0), 0);
      const discount = rowsWithItemData.reduce((sum, s) => sum + (s.totalDiscount ?? ((s.promoDiscount || 0) + (s.flatOffDiscount || 0))), 0);
      const gstCollected = rowsWithItemData.reduce((sum, s) => sum + (s.gstCollected || 0), 0);
      // Payout as a % of the pre-discount, pre-GST menu price - a stricter number than
      // Commission % (which is measured against Net Order Value, already net of
      // discount): this answers "of the shelf price a customer would see, how much do we
      // actually keep" once discount, GST, commission, and ads are all accounted for.
      const payoutPct = hasItemData && itemSubtotal > 0 ? (netPayout / itemSubtotal) * 100 : null;
      // Same rate, but stopping BEFORE ad spend (netPayout above already has ad spend
      // subtracted out of it - see its own definition: netPayout = grossSales -
      // netCommission - adSpend). Confirmed real bug: pricingAdequacy below separately
      // subtracts a per-plate ad share on top of payoutPct, which double-counts ad spend -
      // once implicitly (baked into payoutPct via netPayout) and once explicitly. This is
      // the rate that formula should actually multiply by, so ad spend is deducted exactly
      // once, as its own visible line.
      const preAdPayoutPct = hasItemData && itemSubtotal > 0 ? ((grossSales - netCommission) / itemSubtotal) * 100 : null;
      // Same GST+commission shrinkage, but as a % of the POST-discount base (itemSubtotal
      // minus discount) instead of the raw pre-discount itemSubtotal. Needed because
      // pricingAdequacy's per-item "online price" comes from Ciferon's actual per-item
      // revenue, which is already net of whatever discount applied to that specific order -
      // multiplying an ALREADY-discounted price by a rate that itself still has discount
      // baked in (preAdPayoutPct above) double-discounts a second time. Confirmed against
      // real data: this store's per-dish catalog listing price vs. its actual realized
      // per-piece revenue that day showed discount gaps ranging 0%-25% dish-to-dish, not a
      // single blended rate - so per-item discount is handled separately (see
      // pricingAdequacy's own catalog lookup), and this rate covers only GST+commission on
      // top of whatever Ciferon already recorded as actually billed.
      const preAdPostDiscountPayoutPct = hasItemData && (itemSubtotal - discount) > 0
        ? ((grossSales - netCommission) / (itemSubtotal - discount)) * 100
        : null;
      // "Net Order Value" (grossSales) is summed across ALL settlements in the period, but
      // Items Total/Discount/GST only cover settlements that carry item-level fields
      // (rowsWithItemData) - a settlement uploaded before that field existed contributes
      // its full amount to grossSales while contributing nothing to itemSubtotal, so the
      // two can legitimately disagree for a period that mixes old and new uploads. Surface
      // that gap explicitly instead of letting "Items Total - Discounts + GST" silently not
      // add up to the number shown above it.
      const untrackedCount = rows.length - rowsWithItemData.length;
      const untrackedGrossSales = rows.filter(s => s.itemSubtotal === undefined).reduce((sum, s) => sum + s.grossSales, 0);
      return { orders, grossSales, netPayout, netCommission, adSpend, commissionPct, hasItemData, itemSubtotal, discount, gstCollected, payoutPct, preAdPayoutPct, preAdPostDiscountPayoutPct, untrackedCount, untrackedGrossSales };
    };
    return { zomato: build('zomato'), swiggy: build('swiggy') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlements, filterPreset, appliedCustomStart, appliedCustomEnd]);

  // Daily Payout %/Commission % trend, split by aggregator - Payout % needs Items Total
  // (Zomato only, see byAggregator above), Commission % is available for both.
  const dailyPctTrend = useMemo(() => {
    const build = (aggregator: 'zomato' | 'swiggy') => {
      const rows = filteredSettlements.filter(s => s.aggregator === aggregator);
      const byDate: Record<string, { itemSubtotal: number; grossSales: number; netPayout: number; netCommission: number }> = {};
      rows.forEach(s => {
        const date = s.settlementDate;
        if (!byDate[date]) byDate[date] = { itemSubtotal: 0, grossSales: 0, netPayout: 0, netCommission: 0 };
        byDate[date].itemSubtotal += s.itemSubtotal ?? 0;
        byDate[date].grossSales += s.grossSales;
        byDate[date].netPayout += s.netPayout;
        byDate[date].netCommission += s.netCommission;
      });
      return Object.keys(byDate).sort().map(date => {
        const row = byDate[date];
        return {
          date,
          period: formatDateIN(date, { day: 'numeric', month: 'short' }),
          payoutPct: row.itemSubtotal > 0 ? Math.round((row.netPayout / row.itemSubtotal) * 1000) / 10 : null,
          commissionPct: row.grossSales > 0 ? Math.round((row.netCommission / row.grossSales) * 1000) / 10 : null,
        };
      });
    };
    return { zomato: build('zomato'), swiggy: build('swiggy') };
  }, [filteredSettlements]);

  // "Are we pricing this right online?" - per MENU ITEM (not category - see
  // itemChannelBreakdown on the backend, which normalizes Ciferon's online-only "-O" SKU
  // naming so e.g. "Chicken Steamed Momos [6 Pieces] -O Normal" and the dine-in "Chicken
  // Steamed Momos" are recognized as the same dish instead of two unrelated items with no
  // overlapping data). Compares the average price actually billed on each aggregator against
  // that same item's dine-in/POS price, then nets out that aggregator's average discount+GST+
  // commission shrinkage (Payout % - already computed above from the settlement itself) and a
  // flat per-piece share of ad spend, to get the actual amount that lands in hand per piece
  // sold online. Only works for aggregators/periods with hasItemData (Payout % needs Items
  // Total). itemChannelBreakdown only exists on pos-sync records from 2026-08-23 onward -
  // older dates simply won't contribute any rows here, same go-live-date pattern used
  // elsewhere in this app rather than a false zero.
  const guessItemColor = (itemName: string): string => {
    const n = itemName.toLowerCase();
    if (n.includes('kurkure')) return n.includes('veg') ? '#0ea5e9' : '#6366f1';
    if (n.includes('paneer')) return '#eab308';
    if (n.includes('corn') && n.includes('cheese')) return '#facc15';
    if (n.includes('chicken') && n.includes('cheese')) return '#fb923c';
    if (n.includes('chicken')) return '#f97316';
    return '#16a34a'; // veg / anything else
  };
  // Same bracket/paren-pieces stripping as the backend's normalizeItemName, applied to
  // catalog product names so "Chicken Steamed Momos [6 Pieces]" and "...In Butter Makhni
  // Sauce (6 Pieces)" both collapse to the same bare name itemChannelBreakdown already
  // uses - the join key between the two data sources.
  const normalizeForCatalogMatch = (name: string) => name
    .replace(/\[.*?\]/g, ' ')
    .replace(/\(\s*\d+\s*pieces?\s*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const pricingAdequacy = useMemo(() => {
    if (!hasActiveRange) return { zomato: null, swiggy: null };
    const scoped = (context.categorySalesData || []).filter(r => {
      if (effectiveStoreId && r.storeId !== effectiveStoreId) return false;
      return r.date >= filterStart && r.date <= filterEnd;
    });
    const itemNames = new Set<string>();
    scoped.forEach(r => { Object.keys(r.itemChannelBreakdown || {}).forEach(name => itemNames.add(name)); });

    // Confirmed against real data: Ciferon's per-item online revenue is already NET of
    // whatever discount applied to that specific order (a catalog listing price of ₹91 for
    // Chicken Steamed Momos vs. an actual realized average of ₹82.8 that day - a 9% gap
    // that varies 0%-25% dish to dish, nowhere near a flat rate). The catalog's own listed
    // online price is the true, undiscounted menu price - pull it in per item so "Online
    // ₹/plate" means what's actually printed on the Zomato menu, and the gap to what was
    // really billed becomes each dish's own measured discount instead of a blended guess.
    const catalogByName = new Map<string, { onlinePrice: number; offlinePrice: number }>();
    menuItemPrices.forEach(p => {
      const norm = normalizeForCatalogMatch(p.productName);
      if (!catalogByName.has(norm)) catalogByName.set(norm, { onlinePrice: p.onlinePrice, offlinePrice: p.offlinePrice });
    });

    // Newest listing price per dish on each aggregator, read off the most recent delivery orders
    // (the item rate a Zomato/Swiggy order was billed at is the menu price at that moment). The
    // saved catalog's online prices were typed in once and go stale whenever the menu is repriced.
    const latestOnlinePrice: Record<'Zomato' | 'Swiggy', Map<string, { price: number; date: string; hour: number }>> = { Zomato: new Map(), Swiggy: new Map() };
    priceDiscoveryDetail.forEach(rec => {
      (rec.orders || []).forEach((o: any) => {
        const mode = String(o.paymentMode || '');
        if (mode !== 'Zomato' && mode !== 'Swiggy') return;
        (o.items || []).forEach((it: any) => {
          const price = Number(it.rate);
          if (!(price > 0) || !it.productName) return;
          const key = normalizeForCatalogMatch(String(it.productName).replace(/\s*-\s*O\b.*$/i, ''));
          const hour = typeof o.orderHourIST === 'number' ? o.orderHourIST : -1;
          const cur = latestOnlinePrice[mode].get(key);
          if (!cur || rec.date > cur.date || (rec.date === cur.date && hour >= cur.hour)) latestOnlinePrice[mode].set(key, { price, date: rec.date, hour });
        });
      });
    });

    const build = (aggKey: 'zomato' | 'swiggy', channelName: 'Zomato' | 'Swiggy') => {
      const stats = byAggregator[aggKey];
      if (stats.payoutPct === null || stats.preAdPostDiscountPayoutPct === null) return null; // no item-level data this period - nothing to derive a rate from
      // Ad spend has no per-item attribution in the settlement (order-level only) - so it's
      // shared out evenly per PLATE (unit actually sold - a burger counts as one, a 6pc
      // plate counts as one, a 12pc combo counts as one), not per individual momo piece.
      // Confirmed correction: a per-piece split was overcharging bigger plates/combos and
      // undercharging burgers for the exact same ad budget, when the ad campaign was
      // driving SALES (plates ordered), not individual momos. `pieces / piecesPerUnit`
      // recovers the raw unit count from data that only ever stored the piece-scaled total.
      let totalAggUnits = 0;
      scoped.forEach(r => {
        const breakdown = r.itemChannelBreakdown || {};
        Object.values(breakdown).forEach(item => {
          const pieces = item?.channels?.[channelName]?.pieces || 0;
          const perUnit = item?.piecesPerUnit || 1;
          totalAggUnits += pieces / perUnit;
        });
      });
      // Confirmed real bug: stats.adSpend sums every settlement in the page's whole date
      // filter (e.g. "This Month" pulls in 15 settled days), but itemChannelBreakdown only
      // exists from go-live onward and could be as few as 2-3 of those days - dividing a
      // much bigger ad-spend total by a much smaller unit count than actually earned it
      // inflated adSharePerPlate several-fold (confirmed: ~₹24/plate instead of the correct
      // ~₹8/plate for a 3-days-of-data-inside-a-15-day-settled-window case), dragging every
      // dish's payout down with it. Ad spend has to be scoped to the SAME dates the unit
      // count above was built from, not the page's wider filter window.
      //
      // Second confirmed bug (found via live DEBUG capture): `scoped` is every sales record
      // in the whole filter window regardless of whether it has real breakdown data for this
      // channel - `r.itemChannelBreakdown || {}` silently defaults to `{}` for days with none,
      // but the date still landed in itemDataDates unconditionally. That made itemDataDates
      // balloon to all 24 days of "This Month" instead of the ~3 days with actual Zomato
      // orders, which made hasDirectOverlap match nearly the whole settled period (13 of 14
      // days, ₹3,102.95) and divide it by the tiny real unit count (142) - ₹21.85/plate
      // instead of the correct ~₹5. Only count a date here if it actually contributed a
      // non-zero piece count for this channel.
      const itemDataDates = new Set(
        scoped
          .filter(r => Object.values(r.itemChannelBreakdown || {}).some((item: any) => (item?.channels?.[channelName]?.pieces || 0) > 0))
          .map(r => r.date)
      );
      const settledDatesForAgg = new Set(
        filteredSettlements.filter(s => s.aggregator === aggKey && s.adSpend !== undefined).map(s => s.settlementDate)
      );
      const hasDirectOverlap = [...itemDataDates].some(d => settledDatesForAgg.has(d));
      let adSpendForItemDataDates: number;
      if (hasDirectOverlap) {
        // The item-data day(s) already have their own settlement - use the real figure.
        adSpendForItemDataDates = filteredSettlements
          .filter(s => s.aggregator === aggKey && itemDataDates.has(s.settlementDate))
          .reduce((sum, s) => sum + (s.adSpend || 0), 0);
      } else {
        // Settlements lag real orders by 1-3 days (same reason Payout % itself falls back
        // to a period average) - the item-data day(s) almost always haven't settled yet.
        // Estimate from the recent daily average rather than either silently dropping ad
        // spend to 0 or inflating it with days that had nothing to do with these plates.
        const totalSettledAdSpend = filteredSettlements
          .filter(s => s.aggregator === aggKey && s.adSpend !== undefined)
          .reduce((sum, s) => sum + (s.adSpend || 0), 0);
        const avgDailyAdSpend = settledDatesForAgg.size > 0 ? totalSettledAdSpend / settledDatesForAgg.size : 0;
        adSpendForItemDataDates = avgDailyAdSpend * itemDataDates.size;
      }
      const adSharePerPlate = totalAggUnits > 0 ? adSpendForItemDataDates / totalAggUnits : 0;

      const rows = Array.from(itemNames).map(name => {
        let onlineRevenue = 0, onlinePieces = 0, posRevenue = 0, posPieces = 0, piecesPerPlate = 6;
        scoped.forEach(r => {
          const breakdown = (r.itemChannelBreakdown as any) || {};
          const item = breakdown?.[name];
          if (!item) return;
          if (item.piecesPerUnit) piecesPerPlate = item.piecesPerUnit; // same physical dish every occurrence - see the backend's own comment on this
          const onl = item.channels?.[channelName];
          if (onl) { onlineRevenue += onl.revenue; onlinePieces += onl.pieces; }
          const pos = item.channels?.['POS'];
          if (pos) { posRevenue += pos.revenue; posPieces += pos.pieces; }
        });
        const base = { key: name, label: name, color: guessItemColor(name), piecesPerPlate };
        if (onlinePieces <= 0 || posPieces <= 0) return { ...base, hasData: false as const };
        // onlineRevenue/posRevenue are true totals; pieces/piecesPerPlate recovers the plate
        // count they were sold across, so revenue/units gives a genuine per-plate average
        // price directly - no per-piece intermediate needed now that ad-share is flat per
        // plate rather than scaled by plate size. This is the REALIZED price actually
        // billed (already net of any order-level discount) - not necessarily the listing
        // price, see catalogByName above.
        const onlineUnits = onlinePieces / piecesPerPlate;
        const posUnits = posPieces / piecesPerPlate;
        const realizedPrice = onlineRevenue / onlineUnits;
        const realPrice = posRevenue / posUnits;

        const catalogEntry = catalogByName.get(name);
        // The catalog's own listed price when we have it - the number actually printed on
        // the Zomato menu, and the one a price change would mean typing into Zomato's own
        // system. Falls back to the realized price when no catalog match exists (no
        // discount assumed in that case, since there's nothing to measure it against).
        const latestListing = latestOnlinePrice[channelName].get(name);
        const listingPrice = latestListing?.price ?? catalogEntry?.onlinePrice ?? realizedPrice;
        const hasCatalogPrice = !!catalogEntry || !!latestListing;
        // This dish's OWN discount fraction, measured (not blended) - Chicken Fried Momos
        // showed a real 0% gap the same day Veg Kurkure Momos showed 25%, so a single
        // period-wide discount rate silently overcharged one and undercharged the other.
        // Clamped at 0 so a realized price at or above listing (rounding, or the rare
        // upsell) never gets treated as a negative discount.
        const discountFrac = hasCatalogPrice && listingPrice > 0 ? Math.max(0, (listingPrice - realizedPrice) / listingPrice) : 0;
        // preAdPostDiscountPayoutPct (GST+commission only, on a base that's ALREADY net of
        // discount) times the REALIZED price, minus ad spend as its own line - see that
        // rate's own comment for why this isn't preAdPayoutPct (which still has discount
        // baked in, and would double-discount an already-discounted realized price).
        const postDiscountRate = stats.preAdPostDiscountPayoutPct! / 100;
        const effectivePayout = realizedPrice * postDiscountRate - adSharePerPlate;
        // Listing price needed so effective payout (at this dish's OWN discount fraction,
        // and the same GST/commission/ad-share rates) would just cover the real price -
        // i.e. break even instead of subsidizing the online sale.
        const neededPrice = postDiscountRate > 0 && (1 - discountFrac) > 0
          ? (realPrice + adSharePerPlate) / ((1 - discountFrac) * postDiscountRate)
          : null;
        const priceIncreasePct = neededPrice !== null && listingPrice > 0 ? ((neededPrice - listingPrice) / listingPrice) * 100 : null;
        const marginPerPiece = effectivePayout - realPrice; // per plate despite the name - see the field on the returned row
        const marginPct = realPrice > 0 ? (marginPerPiece / realPrice) * 100 : null;
        return { ...base, hasData: true as const, onlinePrice: listingPrice, realizedPrice, hasCatalogPrice, realPrice, effectivePayout, marginPerPiece, marginPct, priceIncreasePct, onlinePieces };
      })
        // Most-sold items first - the ones worth paying attention to, rather than an
        // alphabetical list burying them among rarely-ordered items with barely any data.
        .sort((a, b) => (('onlinePieces' in b ? b.onlinePieces : 0) - ('onlinePieces' in a ? a.onlinePieces : 0)));
      return {
        rows, adSharePerPlate, payoutPct: stats.preAdPayoutPct!,
      };
    };
    return { zomato: build('zomato', 'Zomato'), swiggy: build('swiggy', 'Swiggy') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.categorySalesData, byAggregator, effectiveStoreId, filterStart, filterEnd, hasActiveRange, menuItemPrices, priceDiscoveryDetail]);

  // Per-promo-code discount breakdown (moved here from Analytics.tsx's "Revenue & Channels"
  // tab, since it's derived straight from these same settlements) - Zomato's own "Discounts
  // Summary" sheet is broken (formula errors linking to a missing external workbook) in
  // every real export seen so far, so this is computed from the settlement's own per-order
  // discountConstruct field instead. Orders with no construct (organic, non-promo orders)
  // are bucketed separately rather than dropped, so order counts still foot to the total.
  const discountByConstructData = useMemo(() => {
    const zomatoOnly = filteredSettlements.filter(s => s.aggregator === 'zomato');
    const byConstruct: Record<string, { discount: number; orders: number }> = {};
    zomatoOnly.forEach(s => {
      (s.orders || []).forEach((o: any) => {
        if (o.promoDiscount === undefined) return; // pre-upgrade order, no discount fields captured
        const key = o.discountConstruct || 'No construct / organic';
        if (!byConstruct[key]) byConstruct[key] = { discount: 0, orders: 0 };
        byConstruct[key].discount += (o.promoDiscount || 0) + (o.flatOffDiscount || 0);
        byConstruct[key].orders += 1;
      });
    });
    return Object.entries(byConstruct)
      .map(([construct, v]) => ({ construct, discount: Math.round(v.discount), orders: v.orders }))
      .sort((a, b) => b.discount - a.discount)
      .slice(0, 10);
  }, [filteredSettlements]);

  // Channel Economics - "would these same dishes have earned more sold at the counter than
  // what Zomato actually paid us?" (moved here from Analytics.tsx's "Revenue & Channels" tab).
  // Three-hop join: AggregatorSettlementOrder.orderId -> OrderItemDetailOrder.externalId (per-
  // order line items) -> MenuItemPrice.offlinePrice (by productId). Deliberately does NOT
  // silently zero-fill orders it can't match or price - a wrong-but-precise number here is
  // worse than an honest partial one, so unmatched/unpriced orders are excluded from the
  // totals and counted separately for the match-rate caption instead.
  //
  // A non-food add-on (a soft drink, water bottle) with no catalog price used to disqualify
  // the WHOLE order from being counted, even when every momo dish in it was fully priced -
  // confirmed against real data (9 of this store's "unpriced" orders in one month were
  // blocked by exactly this, not by an actual missing momo price). Non-food items are now
  // simply skipped when checking "is everything in this order priced", the same keyword
  // filter the POS category sync already uses to separate real dishes from drinks/add-ons.
  const NON_FOOD_KEYWORDS = ['drink', 'cola', 'campa', 'water', 'beverage', 'soup', 'samosa', 'nugget', 'popcorn', 'fries', 'mojito', 'mocktail', 'cake'];
  const isFoodItem = (name: string) => !NON_FOOD_KEYWORDS.some(k => name.toLowerCase().includes(k));

  // Online and counter menus name the same dish differently ("Chicken Steamed Momos [6 Pieces] -O
  // Normal" online vs "Steamed Chicken Momos" at the counter), so dishes are matched on their
  // words, ignoring order, bracketed piece counts, the "-O" online marker, and "momo(s)".
  const dishKey = (name: string) => name
    .toLowerCase()
    .replace(/\[[^\]]*\]|\(\s*\d+\s*pieces?[^)]*\)/gi, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !['o', 'normal', 'regular', 'momo', 'momos', 'piece', 'pieces', 'pcs'].includes(w))
    .sort()
    .join(' ');

  // Each dish's newest price at the counter, from real POS sales (not delivery-app orders, not
  // complimentary ones). The saved menu catalog was seeded once and goes stale whenever prices
  // change; the sales themselves always carry the price actually charged.
  const latestCounterPrices = useMemo(() => {
    const best = new Map<string, { price: number; date: string; hour: number; name: string }>();
    priceDiscoveryDetail.forEach(rec => {
      (rec.orders || []).forEach((o: any) => {
        const mode = String(o.paymentMode || '');
        if (mode === 'Zomato' || mode === 'Swiggy' || mode === 'Complimentary') return;
        (o.items || []).forEach((it: any) => {
          const price = Number(it.rate);
          const name = it.productName || '';
          if (!(price > 0) || !name || !isFoodItem(name)) return;
          const key = dishKey(name);
          if (!key) return;
          const hour = typeof o.orderHourIST === 'number' ? o.orderHourIST : -1;
          const cur = best.get(key);
          if (!cur || rec.date > cur.date || (rec.date === cur.date && hour >= cur.hour)) best.set(key, { price, date: rec.date, hour, name });
        });
      });
    });
    return best;
  }, [priceDiscoveryDetail]);

  const platformName = econPlatform === 'zomato' ? 'Zomato' : 'Swiggy';

  const channelEconomicsByPlatform = useMemo(() => {
   const compute = (platform: 'zomato' | 'swiggy') => {
    const platformSettlements = filteredSettlements.filter(s => s.aggregator === platform);

    const itemDetailByExternalId = new Map<string, any>();
    orderItemDetail.forEach(rec => {
      rec.orders.forEach((o: any) => {
        if (o.externalId) itemDetailByExternalId.set(String(o.externalId), o);
      });
    });
    const offlinePriceByProductId = new Map<string, number>();
    menuItemPrices.forEach(p => offlinePriceByProductId.set(String(p.productId), p.offlinePrice));

    let matchedOrders = 0, unmatchedOrders = 0, unpricedOrders = 0;
    const unpricedItemNames = new Set<string>();
    // Per dish: the counter price used and where it came from, for the "Prices used" table.
    const pricesUsed = new Map<string, { name: string; used: number; source: 'latest' | 'saved'; lastSeen: string | null; saved: number | null; quantity: number }>();
    const byDate: Record<string, { theoreticalOffline: number; itemSubtotal: number; netPayout: number }> = {};

    platformSettlements.forEach(s => {
      const date = settlementPeriodEnd(s);
      (s.orders || []).forEach((order: any) => {
        const detail = itemDetailByExternalId.get(String(order.orderId));
        if (!detail || !detail.items || detail.items.length === 0) { unmatchedOrders++; return; }

        let theoreticalOffline = 0;
        let allPriced = true;
        const orderPrices: { name: string; used: number; source: 'latest' | 'saved'; lastSeen: string | null; saved: number | null; quantity: number }[] = [];
        // Combo-decomposed "-A" sibling lines carry rate 0 by design (the combo's own line already
        // has the full price), and drinks/add-ons don't need a price - both are skipped, as before.
        detail.items.forEach((item: any, idx: number) => {
          if (detail.rawItems?.[idx]?.categoryName === 'Addon') return;
          if (!isFoodItem(item.productName || '')) return;
          const key = dishKey(item.productName || '');
          const latest = key ? latestCounterPrices.get(key) : undefined;
          const saved = item.productId != null ? offlinePriceByProductId.get(String(item.productId)) : undefined;
          const price = latest?.price ?? saved;
          if (price === undefined) { allPriced = false; unpricedItemNames.add(item.productName || String(item.productId)); return; }
          theoreticalOffline += price * (item.quantity || 0);
          orderPrices.push({
            name: (item.productName || '').replace(/\s*-O\b.*$/i, '').trim(),
            used: price,
            source: latest ? 'latest' : 'saved',
            lastSeen: latest?.date ?? null,
            saved: saved ?? null,
            quantity: item.quantity || 0,
          });
        });
        if (!allPriced) { unpricedOrders++; return; }

        matchedOrders++;
        orderPrices.forEach(op => {
          const prev = pricesUsed.get(op.name);
          if (prev) prev.quantity += op.quantity;
          else pricesUsed.set(op.name, { ...op });
        });
        if (!byDate[date]) byDate[date] = { theoreticalOffline: 0, itemSubtotal: 0, netPayout: 0 };
        byDate[date].theoreticalOffline += theoreticalOffline;
        byDate[date].itemSubtotal += order.itemSubtotal ?? 0;
        byDate[date].netPayout += order.netPayout ?? 0;
      });
    });

    const totalOrders = matchedOrders + unmatchedOrders + unpricedOrders;
    const matchRatePct = totalOrders > 0 ? Math.round((matchedOrders / totalOrders) * 1000) / 10 : null;

    const chartData = Object.keys(byDate).sort().map(date => ({
      date,
      period: new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      theoreticalOffline: Math.round(byDate[date].theoreticalOffline),
      itemSubtotal: Math.round(byDate[date].itemSubtotal),
      netPayout: Math.round(byDate[date].netPayout),
    }));

    const totals = chartData.reduce((acc, r) => ({
      theoreticalOffline: acc.theoreticalOffline + r.theoreticalOffline,
      itemSubtotal: acc.itemSubtotal + r.itemSubtotal,
      netPayout: acc.netPayout + r.netPayout,
    }), { theoreticalOffline: 0, itemSubtotal: 0, netPayout: 0 });

    const pricesUsedList = Array.from(pricesUsed.values()).sort((x, y) => y.quantity - x.quantity);
    return {
      chartData,
      matchedOrders, unmatchedOrders, unpricedOrders, totalOrders, matchRatePct,
      unpricedItemNames: Array.from(unpricedItemNames),
      pricesUsedList,
      latestPricedCount: pricesUsedList.filter(p => p.source === 'latest').length,
      // Positive = offline would have earned MORE than the aggregator actually paid - a real deficit
      // from selling via that channel. Negative = the aggregator paid more than the counter price would have.
      deficitVsPayout: totals.theoreticalOffline - totals.netPayout,
      deficitVsMenuSubtotal: totals.theoreticalOffline - totals.itemSubtotal,
      totals,
    };
   };
   return { zomato: compute('zomato'), swiggy: compute('swiggy') };
  }, [filteredSettlements, orderItemDetail, menuItemPrices, latestCounterPrices]);
  const channelEconomicsData = channelEconomicsByPlatform[econPlatform];

  // Zomato + Swiggy together, for the at-a-glance card under Channel Economics.
  const allPlatformsEconomics = useMemo(() => {
    const rows = (['zomato', 'swiggy'] as const).map(agg => ({
      agg,
      label: agg === 'zomato' ? 'Zomato' : 'Swiggy',
      orders: channelEconomicsByPlatform[agg].matchedOrders,
      counter: channelEconomicsByPlatform[agg].totals.theoreticalOffline,
      menu: channelEconomicsByPlatform[agg].totals.itemSubtotal,
      paid: channelEconomicsByPlatform[agg].totals.netPayout,
    }));
    const total = rows.reduce((acc, r) => ({ orders: acc.orders + r.orders, counter: acc.counter + r.counter, menu: acc.menu + r.menu, paid: acc.paid + r.paid }), { orders: 0, counter: 0, menu: 0, paid: 0 });
    return { rows, total };
  }, [channelEconomicsByPlatform]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-500 flex items-center justify-center shadow-lg shadow-sky-500/30 flex-shrink-0">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                Aggregator Payout Reconciliation (Swiggy & Zomato)
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Upload each settlement report as it's downloaded from Swiggy/Zomato - net payout, gross sales, and
                commission are computed automatically, and the net payout is credited to Online Cash in Hand (Paytm)
                on that settlement's own date.
              </p>
            </div>
          </div>
          {canEdit && (
            <button
              onClick={() => { setShowUploadModal(true); setUploadStoreId(defaultUploadStoreId); setParsedSettlements(null); setParseErrors([]); setSaveError(null); setSkippedDuplicates([]); }}
              className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg font-semibold hover:from-orange-700 hover:to-red-700 transition-all shadow-lg"
            >
              <Upload className="w-4 h-4" />
              Upload Settlement
            </button>
          )}
        </div>
      </div>

      {/* Date filter - applies to both the summary cards and the settlement history below */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 sm:p-6 shadow-lg shadow-emerald-500/20 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-emerald-100 font-medium">Net Order Value ({FILTER_LABELS[filterPreset]})</span>
            <DollarSign className="w-5 h-5 text-emerald-100" />
          </div>
          <p className="text-2xl font-semibold">₹{filteredStats.totalSales.toFixed(2)}</p>
          {/* From the aggregator's own settlement report (post-discount, pre-payout) - not
              the same figure as Online Revenue elsewhere in the app, which comes from POS
              billing. Used here for commission % and the Channel Economics comparison. */}
          <p className="text-xs text-emerald-100 mt-1">From settlement report, post-discount - not the same as Online Revenue</p>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 sm:p-6 shadow-lg shadow-blue-500/20 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-blue-100 font-medium">Net Payout ({FILTER_LABELS[filterPreset]})</span>
            <Wallet className="w-5 h-5 text-blue-100" />
          </div>
          <p className="text-2xl font-semibold">₹{filteredStats.totalPayouts.toFixed(2)}</p>
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 sm:p-6 shadow-lg shadow-amber-500/20 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-amber-100 font-medium">Net Commission ({FILTER_LABELS[filterPreset]})</span>
            <TrendingUp className="w-5 h-5 text-amber-100" />
          </div>
          <p className="text-2xl font-semibold">₹{filteredStats.totalCommission.toFixed(2)}</p>
          <p className="text-xs text-amber-100 mt-1">Zomato/Swiggy's service + payment fees, taxes on those, and other order-level deductions - separate from Ad Spend, shown on its own below</p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 sm:p-6 shadow-lg shadow-purple-500/20 text-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-purple-100 font-medium">Ad Spend ({FILTER_LABELS[filterPreset]})</span>
            <TrendingUp className="w-5 h-5 text-purple-100" />
          </div>
          <p className="text-2xl font-semibold">₹{filteredStats.totalAdSpend.toFixed(2)}</p>
          <p className="text-xs text-purple-100 mt-1">Zomato ads + Swiggy ads, from each settlement's Payout Breakup</p>
        </div>
      </div>

      {/* Per-aggregator breakdown - same date filter as the summary cards above */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(['zomato', 'swiggy'] as const).map(agg => {
          const stats = byAggregator[agg];
          return (
            <div key={agg} className={`bg-white rounded-2xl p-5 border shadow-sm ${agg === 'zomato' ? 'border-red-200' : 'border-orange-200'}`}>
              <h3 className="text-base font-bold text-gray-900 capitalize mb-3">{agg} ({FILTER_LABELS[filterPreset]})</h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Orders</p>
                  <p className="text-lg font-semibold text-gray-900">{stats.orders}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Items Total</p>
                  {stats.hasItemData ? (
                    <p className="text-lg font-semibold text-gray-900">₹{stats.itemSubtotal.toFixed(2)}</p>
                  ) : (
                    <p className="text-sm text-gray-400 mt-1">Not tracked yet</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500">Discounts</p>
                  {stats.hasItemData ? (
                    <p className="text-lg font-semibold text-red-600">− ₹{stats.discount.toFixed(2)}</p>
                  ) : (
                    <p className="text-sm text-gray-400 mt-1">Not tracked yet</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500">GST</p>
                  {stats.hasItemData ? (
                    <p className="text-lg font-semibold text-gray-900">+ ₹{stats.gstCollected.toFixed(2)}</p>
                  ) : (
                    <p className="text-sm text-gray-400 mt-1">Not tracked yet</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100">
                <div>
                  <p className="text-xs text-gray-500">Net Order Value</p>
                  <p className="text-lg font-semibold text-gray-900">₹{stats.grossSales.toFixed(2)}</p>
                  {stats.untrackedCount > 0 ? (
                    <p className="text-[11px] text-amber-600" title={`₹${stats.untrackedGrossSales.toFixed(2)} from ${stats.untrackedCount} settlement(s) uploaded before item-level tracking existed - re-upload them to include in Items Total/Discounts/GST`}>
                      Includes ₹{stats.untrackedGrossSales.toFixed(2)} from {stats.untrackedCount} untracked settlement{stats.untrackedCount > 1 ? 's' : ''} - re-upload to reconcile
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-400">Items Total − Discounts + GST</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500">Net Commission</p>
                  <p className={`text-lg font-semibold ${stats.netCommission >= 0 ? 'text-orange-600' : 'text-red-600'}`}>₹{stats.netCommission.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Ad Spend</p>
                  <p className="text-lg font-semibold text-purple-600">₹{stats.adSpend.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Net Payout</p>
                  <p className="text-lg font-semibold text-blue-600">₹{stats.netPayout.toFixed(2)}</p>
                  <p className="text-[11px] text-gray-400">Net Order Value − Commission − Ad Spend</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between col-span-2">
                  <span className="text-xs text-gray-500">Payout % <span className="text-gray-400">(of Items Total)</span></span>
                  <span className={`text-sm font-semibold ${stats.payoutPct === null ? 'text-gray-400' : stats.payoutPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {stats.payoutPct === null ? 'Not tracked yet' : `${stats.payoutPct.toFixed(1)}%`}
                  </span>
                </div>
                <div className="flex items-center justify-between col-span-2">
                  <span className="text-xs text-gray-500">Commission % <span className="text-gray-400">(of Net Order Value)</span></span>
                  <span className={`text-sm font-semibold ${stats.commissionPct >= 0 ? 'text-orange-600' : 'text-red-600'}`}>{stats.commissionPct.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Payout %/Commission % trend, per aggregator - Payout % needs Items Total, only
          available for Zomato settlements uploaded after that field existed. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(['zomato', 'swiggy'] as const).map(agg => {
          const trend = dailyPctTrend[agg];
          const hasPayoutPct = trend.some(r => r.payoutPct !== null);
          const hasAnyData = trend.some(r => r.payoutPct !== null || r.commissionPct !== null);
          return (
            <div key={agg} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight capitalize mb-1">{agg} - Payout % vs Commission %</h3>
              <p className="text-xs text-gray-500 mb-4">
                By settlement date{!hasPayoutPct ? ' · Payout % needs Items Total, not tracked for this aggregator yet' : ''}
              </p>
              {hasAnyData ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip formatter={(value: number, name: string) => [value === null ? 'N/A' : `${value}%`, name]} />
                    <Legend />
                    {hasPayoutPct && (
                      <Line type="monotone" dataKey="payoutPct" stroke="#059669" strokeWidth={2} name="Payout %" dot={{ r: 3 }} connectNulls />
                    )}
                    <Line type="monotone" dataKey="commissionPct" stroke="#ea580c" strokeWidth={2} name="Commission %" dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-gray-500 py-8 text-sm">No {agg} settlements in this period</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Zomato Discounts - moved here from Analytics so it sits with the settlements it's
          derived from, using this page's own date-range filter above. */}
      {hasActiveRange && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-1 flex items-center gap-2">
              <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
              Zomato Discount % of Menu Subtotal
            </h3>
            <p className="text-xs text-gray-500 mb-4">Promo + flat-off discount as a % of the pre-discount dish price total, from Zomato's own settlement file</p>
            {discountChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={discountChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip formatter={(value: number) => [`${value}%`, 'Discount']} />
                  <Line type="monotone" dataKey="discountPct" stroke="#9333ea" strokeWidth={2} name="Discount %" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-gray-500 py-8 text-sm">No Zomato settlements with discount data in this period</div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-1 flex items-center gap-2">
              <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600" />
              Promo vs Flat-off Discount
            </h3>
            <p className="text-xs text-gray-500 mb-4">₹ discount by type, per settlement date</p>
            {discountChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={discountChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="promoDiscount" stackId="disc" fill="#f97316" name="Promo" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="flatOffDiscount" stackId="disc" fill="#a855f7" name="Flat-off" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-gray-500 py-8 text-sm">No Zomato settlements with discount data in this period</div>
            )}
          </div>
        </div>
      )}

      {/* Discount by Promo Code + Channel Economics - moved here from Analytics.tsx's
          "Revenue & Channels" tab so they sit with the settlements/orders they're derived
          from, using this page's own date-range filter above. */}
      {hasActiveRange && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Per-promo-code breakdown - replaces Zomato's own "Discounts Summary" sheet,
              which is broken (formula errors) in every real export seen so far. */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-1 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
              Discount by Promo Code
            </h3>
            <p className="text-xs text-gray-500 mb-4">Top Zomato codes by total ₹ discount given in this period, with the order count each one applied to</p>
            {discountByConstructData.length > 0 ? (
              <div className="space-y-2">
                {discountByConstructData.map(row => {
                  const maxDiscount = discountByConstructData[0]?.discount || 1;
                  return (
                    <div key={row.construct} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 w-40 sm:w-48 truncate flex-shrink-0" title={row.construct}>{row.construct}</span>
                      <div className="flex-1 min-w-0">
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="h-2 rounded-full bg-purple-500" style={{ width: `${Math.max(4, (row.discount / maxDiscount) * 100)}%` }} />
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-gray-900 flex-shrink-0 w-28 text-right tabular-nums">₹{row.discount.toLocaleString('en-IN')} ({row.orders})</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8 text-sm">No Zomato settlements with promo-code data in this period</div>
            )}
          </div>

          <div className="space-y-4">
          {/* Channel Economics - "would these dishes have earned more sold at the counter than what
              the aggregator actually paid us?" For Zomato or Swiggy (toggle). Counter prices are each
              dish's newest price from POS sales; see channelEconomicsData / latestCounterPrices. */}
          <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                Channel Economics
              </h3>
              <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs" role="group" aria-label="Aggregator">
                {(['zomato', 'swiggy'] as const).map((agg, i) => (
                  <button
                    key={agg}
                    onClick={() => setEconPlatform(agg)}
                    className={`px-3 py-1.5 capitalize ${i > 0 ? 'border-l border-gray-200' : ''} ${econPlatform === agg ? (agg === 'zomato' ? 'bg-red-600 text-white' : 'bg-orange-500 text-white') : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    {agg}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              For every real {platformName} order this period, what the exact same dishes would have cost at your counter - compared to what {platformName}'s menu listed them at, and what {platformName} actually paid you.
            </p>

            {channelEconomicsData.totalOrders === 0 ? (
              <div className="text-center text-gray-500 py-8 text-sm">No {platformName} orders with item-level detail in this period</div>
            ) : (
              <>
                {/* The three raw inputs, side by side, before the derived deficit/markup
                    cards below - so the two big numbers aren't a black box. */}
                <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">Counter Price</p>
                    <p className="text-sm font-bold text-emerald-700">₹{channelEconomicsData.totals.theoreticalOffline.toLocaleString('en-IN')}</p>
                    <p className="text-[10px] text-gray-400">same dishes, latest dine-in price</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">{platformName} Menu Price</p>
                    <p className="text-sm font-bold text-slate-700">₹{channelEconomicsData.totals.itemSubtotal.toLocaleString('en-IN')}</p>
                    <p className="text-[10px] text-gray-400">what {platformName} listed them at</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">{platformName} Paid You</p>
                    <p className="text-sm font-bold text-orange-600">₹{channelEconomicsData.totals.netPayout.toLocaleString('en-IN')}</p>
                    <p className="text-[10px] text-gray-400">actual net payout</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div className={`rounded-xl p-4 shadow-lg text-white ${channelEconomicsData.deficitVsPayout > 0 ? 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/20' : 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/20'}`}>
                    <div className="text-xs uppercase tracking-wide text-white/80 mb-1">
                      {channelEconomicsData.deficitVsPayout > 0 ? 'Money Left on the Table' : `${platformName} Paid a Premium`}
                    </div>
                    <div className="text-2xl font-semibold">₹{Math.abs(channelEconomicsData.deficitVsPayout).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                    <div className="text-xs text-white/80 mt-1">
                      {channelEconomicsData.deficitVsPayout > 0
                        ? `Counter Price − ${platformName} Paid You: these dishes would have earned this much more sold at the counter`
                        : `Counter Price − ${platformName} Paid You: ${platformName} actually paid more than counter price for these dishes`}
                    </div>
                  </div>
                  <div className="rounded-xl p-4 shadow-lg text-white bg-gradient-to-br from-slate-500 to-slate-600 shadow-slate-500/20">
                    <div className="text-xs uppercase tracking-wide text-white/80 mb-1">Online Menu Markup</div>
                    <div className="text-2xl font-semibold">₹{Math.abs(channelEconomicsData.deficitVsMenuSubtotal).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                    <div className="text-xs text-white/80 mt-1">
                      {channelEconomicsData.deficitVsMenuSubtotal < 0
                        ? `Counter Price − ${platformName} Menu Price: ${platformName} lists these dishes higher than the counter, but it isn't enough to cover the deficit above`
                        : `Counter Price − ${platformName} Menu Price: ${platformName}'s listed prices are at or below counter price for these dishes`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-2 mb-3 text-xs">
                  <span className="text-gray-500">
                    Based on <span className="font-semibold text-gray-700">{channelEconomicsData.matchedOrders}</span> of {channelEconomicsData.totalOrders} {platformName} orders ({channelEconomicsData.matchRatePct}% matched to item + price data)
                  </span>
                  <div className="flex gap-1.5">
                    {channelEconomicsData.unmatchedOrders > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{channelEconomicsData.unmatchedOrders} unmatched</span>
                    )}
                    {channelEconomicsData.unpricedOrders > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium" title={channelEconomicsData.unpricedItemNames.join(', ')}>
                        {channelEconomicsData.unpricedOrders} missing item price
                      </span>
                    )}
                  </div>
                </div>

                {/* Where each counter price came from - the newest sale at the counter, or the saved menu price as a fallback. */}
                <details className="mb-3 rounded-lg border border-gray-200 bg-gray-50/60">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-700">
                    Counter prices used - {channelEconomicsData.latestPricedCount} of {channelEconomicsData.pricesUsedList.length} dishes priced from the latest counter sales
                  </summary>
                  <div className="px-3 pb-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="py-1.5 pr-2 font-medium">Dish</th>
                          <th className="py-1.5 px-1 font-medium text-right">Sold</th>
                          <th className="py-1.5 px-1 font-medium text-right">Counter ₹</th>
                          <th className="py-1.5 pl-1 font-medium">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {channelEconomicsData.pricesUsedList.map(row => (
                          <tr key={row.name} className="border-t border-gray-100">
                            <td className="py-1.5 pr-2 text-gray-800">{row.name}</td>
                            <td className="py-1.5 px-1 text-right tabular-nums text-gray-600">{row.quantity}</td>
                            <td className="py-1.5 px-1 text-right tabular-nums font-semibold text-gray-900">
                              ₹{row.used}
                              {row.saved !== null && row.saved !== row.used && <span className="block text-[10px] font-normal text-amber-600">saved menu: ₹{row.saved}</span>}
                            </td>
                            <td className="py-1.5 pl-1 text-gray-500">
                              {row.source === 'latest' ? `Latest sale${row.lastSeen ? ` (${formatDateIN(row.lastSeen, { day: 'numeric', month: 'short' })})` : ''}` : 'Saved menu price'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>

                {channelEconomicsData.chartData.length > 0 && (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={channelEconomicsData.chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number, name: string) => [`₹${value.toLocaleString('en-IN')}`, name]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="theoreticalOffline" stroke="#16a34a" strokeWidth={2} name="Counter Price" dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="itemSubtotal" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 3" name={`${platformName} Menu Price`} dot={false} />
                      <Line type="monotone" dataKey="netPayout" stroke="#f59e0b" strokeWidth={2} name={`${platformName} Paid You`} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </>
            )}
          </div>

          {/* Aggregated across every online platform, so the combined picture is visible at a glance. */}
          <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-4 sm:p-5">
            <h4 className="text-sm font-bold text-gray-900 tracking-tight mb-0.5">All online platforms</h4>
            <p className="text-[11px] text-gray-500 mb-3">Zomato + Swiggy together for this period, same matched orders as above</p>
            <div className="grid grid-cols-3 gap-2 mb-3 text-center">
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Counter Price</p>
                <p className="text-sm font-bold text-emerald-700 tabular-nums">₹{allPlatformsEconomics.total.counter.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Online Menu Price</p>
                <p className="text-sm font-bold text-slate-700 tabular-nums">₹{allPlatformsEconomics.total.menu.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Online Paid You</p>
                <p className="text-sm font-bold text-orange-600 tabular-nums">₹{allPlatformsEconomics.total.paid.toLocaleString('en-IN')}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-1.5 pr-2 font-medium">Platform</th>
                    <th className="py-1.5 px-1 font-medium text-right">Orders</th>
                    <th className="py-1.5 px-1 font-medium text-right">Counter</th>
                    <th className="py-1.5 px-1 font-medium text-right">Menu</th>
                    <th className="py-1.5 px-1 font-medium text-right">Paid you</th>
                    <th className="py-1.5 pl-1 font-medium text-right" title="Counter Price minus what the platform paid you">Left on table</th>
                  </tr>
                </thead>
                <tbody>
                  {allPlatformsEconomics.rows.map(r => (
                    <tr key={r.agg} className="border-t border-gray-100">
                      <td className="py-1.5 pr-2 font-medium text-gray-800">{r.label}</td>
                      <td className="py-1.5 px-1 text-right tabular-nums text-gray-600">{r.orders}</td>
                      <td className="py-1.5 px-1 text-right tabular-nums">₹{r.counter.toLocaleString('en-IN')}</td>
                      <td className="py-1.5 px-1 text-right tabular-nums">₹{r.menu.toLocaleString('en-IN')}</td>
                      <td className="py-1.5 px-1 text-right tabular-nums">₹{r.paid.toLocaleString('en-IN')}</td>
                      <td className={`py-1.5 pl-1 text-right tabular-nums font-semibold ${r.counter - r.paid > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {r.counter - r.paid > 0 ? '' : '+'}₹{Math.abs(Math.round(r.counter - r.paid)).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-200 font-bold">
                    <td className="py-1.5 pr-2 text-gray-900">Total</td>
                    <td className="py-1.5 px-1 text-right tabular-nums text-gray-900">{allPlatformsEconomics.total.orders}</td>
                    <td className="py-1.5 px-1 text-right tabular-nums text-gray-900">₹{allPlatformsEconomics.total.counter.toLocaleString('en-IN')}</td>
                    <td className="py-1.5 px-1 text-right tabular-nums text-gray-900">₹{allPlatformsEconomics.total.menu.toLocaleString('en-IN')}</td>
                    <td className="py-1.5 px-1 text-right tabular-nums text-gray-900">₹{allPlatformsEconomics.total.paid.toLocaleString('en-IN')}</td>
                    <td className={`py-1.5 pl-1 text-right tabular-nums ${allPlatformsEconomics.total.counter - allPlatformsEconomics.total.paid > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {allPlatformsEconomics.total.counter - allPlatformsEconomics.total.paid > 0 ? '' : '+'}₹{Math.abs(Math.round(allPlatformsEconomics.total.counter - allPlatformsEconomics.total.paid)).toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Are we pricing this right online? - per MENU ITEM, compares the effective amount
          that lands in hand per piece sold on each aggregator (online price, after that
          aggregator's average discount+GST+commission shrinkage and a per-piece share of ad
          spend) against the same item's dine-in/POS price. See the pricingAdequacy comment
          above for the "-O" SKU-name normalization this depends on. */}
      {hasActiveRange && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(['zomato', 'swiggy'] as const).map(agg => {
            const data = pricingAdequacy[agg];
            const rowsWithData = data?.rows.filter(r => r.hasData) || [];
            const chartRows = rowsWithData.slice(0, 10); // top 10 by volume - a bar per item beyond that stops being readable
            return (
              <div key={agg} className={`bg-white rounded-2xl border shadow-sm p-4 sm:p-6 ${agg === 'zomato' ? 'border-red-200' : 'border-orange-200'}`}>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight capitalize mb-1">{agg} - Are We Pricing This Right?</h3>
                <p className="text-xs text-gray-500 mb-4">
                  Effective payout per plate (the price actually billed after any discount, × Payout %, minus that plate's share of ad spend) vs your dine-in price for the same menu item. "Online ₹/plate" is the latest menu listing price (from the newest {agg} orders) - see "billed avg" below it where the two differ
                </p>
                {!data ? (
                  <div className="text-center text-gray-500 py-8 text-sm">Needs Items Total data - upload/re-upload settlements with item-level tracking for this period</div>
                ) : rowsWithData.length === 0 ? (
                  <div className="text-center text-gray-500 py-8 text-sm">No {agg} online sales matched to POS item data in this period (needs pos-sync data from 2026-08-23 onward)</div>
                ) : (
                  <>
                    <div className="overflow-x-auto overflow-y-auto max-h-80 -mx-1">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white">
                          <tr className="text-left text-gray-500 text-xs uppercase tracking-wide">
                            <th className="py-2 px-1 font-medium">Item</th>
                            <th className="py-2 px-1 font-medium text-right">Online ₹/plate</th>
                            <th className="py-2 px-1 font-medium text-right">Real ₹/plate</th>
                            <th className="py-2 px-1 font-medium text-right">Payout ₹/plate</th>
                            <th className="py-2 px-1 font-medium text-right">Margin</th>
                            <th className="py-2 px-1 font-medium text-right">Suggested Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rowsWithData.map(r => {
                            const isLoss = (r.marginPct ?? 0) < 0;
                            return (
                              <tr key={r.key} className="border-t border-gray-100">
                                <td className="py-2 px-1 flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                                  {r.label}
                                  <span className="text-[10px] text-gray-400 font-normal">({r.piecesPerPlate}pc)</span>
                                </td>
                                <td className="py-2 px-1 text-right text-gray-700">
                                  ₹{r.onlinePrice.toFixed(1)}
                                  {r.hasCatalogPrice && Math.abs(r.realizedPrice - r.onlinePrice) > 0.5 && (
                                    <div className="text-[10px] text-amber-600 font-normal" title="Average actually billed after order-level discounts, vs. the listed menu price at left">
                                      billed avg ₹{r.realizedPrice.toFixed(1)}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 px-1 text-right text-gray-700">₹{r.realPrice.toFixed(1)}</td>
                                <td className="py-2 px-1 text-right text-gray-700">₹{r.effectivePayout.toFixed(1)}</td>
                                <td className={`py-2 px-1 text-right font-medium ${isLoss ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {r.marginPct !== null ? `${r.marginPct >= 0 ? '+' : ''}${r.marginPct.toFixed(0)}%` : '—'}
                                </td>
                                <td className="py-2 px-1 text-right">
                                  {r.priceIncreasePct !== null && r.priceIncreasePct > 1 ? (
                                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Raise +{r.priceIncreasePct.toFixed(0)}%</span>
                                  ) : (
                                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Healthy</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-2">Sorted by online pieces sold, most first{rowsWithData.length > chartRows.length ? ` - chart below shows the top ${chartRows.length}` : ''}</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={chartRows.map(r => ({ name: r.label, marginPct: r.marginPct !== null ? Math.round(r.marginPct * 10) / 10 : 0, color: (r.marginPct ?? 0) < 0 ? '#dc2626' : '#059669' }))} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={70} />
                        <YAxis tick={{ fontSize: 11 }} unit="%" />
                        <Tooltip formatter={(value: number) => [`${value}%`, 'Margin vs dine-in price']} />
                        <Bar dataKey="marginPct" radius={[4, 4, 0, 0]}>
                          {chartRows.map((r, i) => (
                            <Cell key={i} fill={(r.marginPct ?? 0) < 0 ? '#dc2626' : '#059669'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="text-[11px] text-gray-400 mt-2">
                      Discount + GST + commission keep {data.payoutPct.toFixed(1)}% of listing price, then a further ₹{data.adSharePerPlate.toFixed(2)}/plate goes to ad spend (same flat share whether it's a 2pc burger, 6pc plate, or 12pc combo) - shown separately so ad spend isn't deducted twice
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Settlement History - collapsible, uses the date filter above */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <button
          onClick={() => setIsHistoryOpen(!isHistoryOpen)}
          className="w-full flex items-center justify-between p-6 text-left"
        >
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">Settlement History</h3>
          {isHistoryOpen ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
        </button>

        {isHistoryOpen && (
          <div className="px-6 pb-6">
            {!hasActiveRange ? (
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
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Net Order Value</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Net Payout</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Commission</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Ad Spend</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Bank UTR</th>
                      {canEdit && <th className="text-right py-3 px-4 font-semibold text-gray-700"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSettlements.map(s => (
                      <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-700">
                          <div>{formatDateIN(s.settlementDate)}</div>
                          <div className="text-xs text-gray-400">Sales: {formatSettlementPeriod(s)}</div>
                        </td>
                        <td className="py-3 px-4 text-gray-700 capitalize">{s.aggregator}</td>
                        <td className="py-3 px-4 text-right text-gray-700">{s.orderCount}</td>
                        <td className="py-3 px-4 text-right text-gray-700">₹{s.grossSales.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-semibold text-blue-600">₹{s.netPayout.toFixed(2)}</td>
                        <td className={`py-3 px-4 text-right font-semibold ${s.netCommission >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
                          ₹{s.netCommission.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-700">
                          {s.adSpend !== undefined ? `₹${s.adSpend.toFixed(2)}` : <span className="text-gray-400">—</span>}
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
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
                <label className="block text-sm font-semibold text-gray-700 mb-2">Store</label>
                {defaultUploadStoreId ? (
                  <div className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800">
                    {availableStores.find(s => s.id === defaultUploadStoreId)?.name || defaultUploadStoreId}
                  </div>
                ) : (
                  <select
                    value={uploadStoreId}
                    onChange={(e) => { setUploadStoreId(e.target.value); setSaveError(null); }}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="">Select store</option>
                    {availableStores.map(store => (
                      <option key={store.id} value={store.id}>{store.name}</option>
                    ))}
                  </select>
                )}
              </div>

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
                      <li key={i}><span className="font-medium">{d.fileName}</span> - settlement date {formatDateIN(d.settlementDate)}</li>
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
                    <div key={i} className={`border-2 rounded-lg p-4 space-y-1.5 ${s.replacesId ? 'bg-amber-50 border-amber-300' : 'bg-orange-50 border-orange-200'}`}>
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
                      {s.replacesId && (
                        <p className="text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded px-2 py-1">
                          Replaces an existing settlement already uploaded for this date/UTR - the old one will be overwritten.
                        </p>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Settlement Date</span>
                        <span className="font-medium text-gray-900">{formatDateIN(s.settlementDate, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Sales Period</span>
                        <span className="font-medium text-gray-900">{formatSettlementPeriod(s)}</span>
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
                        <span className="text-gray-600">Net Order Value</span>
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
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Ad Spend</span>
                        <span className="font-medium text-purple-700">
                          {s.adSpend !== undefined ? `₹${s.adSpend.toFixed(2)}` : 'not found in file'}
                        </span>
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
