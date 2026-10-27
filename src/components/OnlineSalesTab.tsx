// Money > Payouts: Zomato and Swiggy settlements. One primary action (Upload settlement), the
// period as one chip, the net payout headline, then one platform at a time (segmented): its
// figures, payout/commission trend, discounts, channel economics and per-item pricing as lists
// (tables only from 1024 px); long explanations behind How it works.
import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { confirm } from './ui/confirm';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { CHART_COLORS, CHART_SERIES, ShareBars } from './ui/chart-theme';
import { EmptyState } from './ui/empty-state';
import { Field, controlClasses } from './ui/field';
import { IconButton } from './ui/icon-button';
import { ListGroup, ListRow } from './ui/list-row';
import { ResponsiveModal } from './ui/responsive-modal';
import { SegmentedControl } from './ui/segmented-control';
import { StatGrid, StatSplit, StatTile } from './ui/stat-tile';
import { StatusChip } from './ui/status-chip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { cn } from './ui/utils';
import { HowItWorks, MiniFigures, OptionChip, SectionHeading, TextRow } from './insights/parts/common';
import { ChartCard, ChartEmpty, TrendChart } from './insights/tabs/shared';
import { InventoryContextType } from '../App';
import { Upload, X, CheckCircle, AlertCircle, Trash2, FileSpreadsheet } from 'lucide-react';
import * as api from '../utils/api';
import { parseZomatoSettlementFile, parseSwiggySettlementFile, ParsedSettlement } from '../utils/aggregatorSettlementParser';
import { getSettlementPeriod, settlementOverlapsPeriod } from '../utils/settlementPeriod';
import { getTodayIST, addDays } from '../utils/timezone';
import { SettlementCoverage } from './SettlementCoverage';

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
  // POS online sales and old manual payout entries for the same store, for the settlement check.
  const storeOnlineSales = useMemo(
    () => (context.onlineSalesData || []).filter((s: any) => !effectiveStoreId || effectiveStoreId === 'all' || s.storeId === effectiveStoreId),
    [context.onlineSalesData, effectiveStoreId]
  );
  const storeOnlinePayouts = useMemo(
    () => (context.onlinePayoutData || []).filter((p: any) => !effectiveStoreId || effectiveStoreId === 'all' || p.storeId === effectiveStoreId),
    [context.onlinePayoutData, effectiveStoreId]
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
    if (!(await confirm({ title: 'Delete this settlement?', body: 'The Paytm balance for its settlement date goes down by its payout.', confirmLabel: 'Delete settlement', tone: 'danger' }))) return;
    setDeletingId(id);
    try {
      await api.deleteAggregatorSettlement(context.user.accessToken, id);
      if (context.refreshData) await context.refreshData();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete settlement');
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
    if (n.includes('kurkure')) return n.includes('veg') ? 'var(--chart-4)' : 'var(--chart-4)';
    if (n.includes('paneer')) return 'var(--chart-3)';
    if (n.includes('corn') && n.includes('cheese')) return 'var(--chart-3)';
    if (n.includes('chicken') && n.includes('cheese')) return 'var(--chart-1)';
    if (n.includes('chicken')) return 'var(--chart-1)';
    return 'var(--chart-2)'; // veg / anything else
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

  const rupees = (n: number) => `₹${n.toFixed(2)}`;
  const openUpload = () => { setShowUploadModal(true); setUploadStoreId(defaultUploadStoreId); setParsedSettlements(null); setParseErrors([]); setSaveError(null); setSkippedDuplicates([]); };
  const stats = byAggregator[econPlatform];
  const trend = dailyPctTrend[econPlatform];
  const hasPayoutPct = trend.some(r => r.payoutPct !== null);
  const hasAnyTrend = trend.some(r => r.payoutPct !== null || r.commissionPct !== null);
  const pricing = pricingAdequacy[econPlatform];
  const pricingRows = pricing?.rows.filter(r => r.hasData) || [];
  const pricingChartRows = pricingRows.slice(0, 10); // top 10 by volume - a bar per item beyond that stops being readable
  const periodLabel = FILTER_LABELS[filterPreset];
  const [pricesOpen, setPricesOpen] = useState(false);
  const rowsCaption = (all: number, shown: number) => (all > shown ? `Top ${shown} by online pieces sold` : 'By online pieces sold');
  const leftOnTable = (counter: number, paid: number) => `${counter - paid > 0 ? '' : '+'}₹${Math.abs(Math.round(counter - paid)).toLocaleString('en-IN')}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Header: one primary action, the period, and the explanation behind How it works */}
      <section className="flex flex-col gap-3" aria-labelledby="payouts-title">
        <SectionHeading id="payouts-title" title="Aggregator payouts" caption="Zomato and Swiggy settlements, commission and what each platform really pays" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <OptionChip title="Period" value={filterPreset} onChange={setFilterPreset} options={FILTER_OPTIONS.map(([value, label]) => ({ value, label }))} />
          {canEdit && <Button leadingIcon={<Upload />} onClick={openUpload}>Upload settlement</Button>}
        </div>
        {filterPreset === 'custom' && (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From" className="w-40">
              <input type="date" value={draftCustomStart} onChange={(e) => setDraftCustomStart(e.target.value)} className={controlClasses} />
            </Field>
            <Field label="To" className="w-40">
              <input type="date" value={draftCustomEnd} onChange={(e) => setDraftCustomEnd(e.target.value)} className={controlClasses} />
            </Field>
            <Button variant="secondary" size="lg" onClick={() => { setAppliedCustomStart(draftCustomStart); setAppliedCustomEnd(draftCustomEnd); }} disabled={!draftCustomStart || !draftCustomEnd}>Apply</Button>
            {!appliedCustomStart && <span className="text-label text-text-3">Pick both dates and press Apply</span>}
          </div>
        )}
        <HowItWorks title="Aggregator payouts">
          <p>Upload each settlement report as it's downloaded from Swiggy or Zomato. Net payout, sales and commission are worked out automatically, and the net payout is added to online cash (Paytm) on that settlement's own date.</p>
          <p><span className="font-medium text-text">Net order value</span> comes from the settlement report, after discounts - not the same figure as online revenue elsewhere in the app, which comes from POS billing.</p>
          <p><span className="font-medium text-text">Net commission</span> is Zomato's or Swiggy's service and payment fees, taxes on those and other order-level deductions. Ad spend is shown on its own.</p>
        </HowItWorks>
      </section>

      {/* Which days have a settlement and which are missing */}
      {hasActiveRange && (
        <SettlementCoverage
          settlements={settlements}
          onlineSales={storeOnlineSales}
          onlinePayouts={storeOnlinePayouts}
          start={filterStart}
          end={filterEnd}
        />
      )}

      {/* Headline: what the platforms paid, with the split */}
      <StatTile
        hero
        label={`Net payout · ${periodLabel}`}
        value={rupees(filteredStats.totalPayouts)}
      >
        <StatSplit
          items={[
            { label: 'Net order value', value: rupees(filteredStats.totalSales) },
            { label: 'Commission', value: rupees(filteredStats.totalCommission) },
            { label: 'Ad spend', value: rupees(filteredStats.totalAdSpend) },
          ]}
        />
      </StatTile>

      {/* One platform at a time */}
      <SegmentedControl
        aria-label="Platform"
        value={econPlatform}
        onValueChange={setEconPlatform}
        options={[{ value: 'zomato', label: 'Zomato' }, { value: 'swiggy', label: 'Swiggy' }]}
        className="sm:max-w-sm"
      />

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <ListGroup title={`${platformName} · ${periodLabel}`}>
          <ListRow density="compact" title="Orders" trailing={<span className="num text-body-md font-semibold text-text">{stats.orders}</span>} />
          <ListRow density="compact" title="Items total" trailing={stats.hasItemData ? <span className="num text-body-md font-semibold text-text">{rupees(stats.itemSubtotal)}</span> : <span className="text-label text-text-3">Not tracked yet</span>} />
          <ListRow density="compact" title="Discounts" trailing={stats.hasItemData ? <span className="num text-body-md font-semibold text-danger">− {rupees(stats.discount)}</span> : <span className="text-label text-text-3">Not tracked yet</span>} />
          <ListRow density="compact" title="GST" trailing={stats.hasItemData ? <span className="num text-body-md font-semibold text-text">+ {rupees(stats.gstCollected)}</span> : <span className="text-label text-text-3">Not tracked yet</span>} />
          <TextRow
            title="Net order value"
            lines={[stats.untrackedCount > 0
              ? <span className="text-warning">Includes {rupees(stats.untrackedGrossSales)} from {stats.untrackedCount} untracked settlement{stats.untrackedCount > 1 ? 's' : ''} - re-upload to reconcile</span>
              : 'Items total − discounts + GST']}
            trailing={<span className="num text-body-md font-semibold text-text">{rupees(stats.grossSales)}</span>}
          />
          <ListRow density="compact" title="Net commission" trailing={<span className={cn('num text-body-md font-semibold', stats.netCommission >= 0 ? 'text-text' : 'text-danger')}>{rupees(stats.netCommission)}</span>} />
          <ListRow density="compact" title="Ad spend" trailing={<span className="num text-body-md font-semibold text-text">{rupees(stats.adSpend)}</span>} />
          <TextRow title="Net payout" lines={['Net order value − commission − ad spend']} trailing={<span className="num text-body-md font-semibold text-text">{rupees(stats.netPayout)}</span>} />
          <ListRow density="compact" title="Payout %" subtitle="Of items total" trailing={stats.payoutPct === null ? <span className="text-label text-text-3">Not tracked yet</span> : <span className={cn('num text-body-md font-semibold', stats.payoutPct >= 0 ? 'text-success' : 'text-danger')}>{stats.payoutPct.toFixed(1)}%</span>} />
          <ListRow density="compact" title="Commission %" subtitle="Of net order value" trailing={<span className={cn('num text-body-md font-semibold', stats.commissionPct >= 0 ? 'text-text' : 'text-danger')}>{stats.commissionPct.toFixed(1)}%</span>} />
        </ListGroup>

        <ChartCard
          title="Payout % and commission %"
          caption={`By settlement date${!hasPayoutPct ? ' · payout % needs items total, not tracked for this platform yet' : ''}`}
          legend={[
            ...(hasPayoutPct ? [{ label: 'Payout %', color: CHART_SERIES[1] }] : []),
            { label: 'Commission %', color: CHART_SERIES[0] },
          ]}
        >
          {hasAnyTrend ? (
            <TrendChart
              data={trend}
              format="percent"
              height={220}
              series={[
                ...(hasPayoutPct ? [{ key: 'payoutPct', name: 'Payout %', color: CHART_SERIES[1] }] : []),
                { key: 'commissionPct', name: 'Commission %', color: CHART_SERIES[0] },
              ]}
              ariaLabel={`${platformName} payout and commission percentages by settlement date`}
            />
          ) : (
            <ChartEmpty title={`No ${econPlatform} settlements in this period`} body=" " />
          )}
        </ChartCard>
      </div>

      {/* Zomato discounts (Zomato's settlement file has them) */}
      {hasActiveRange && econPlatform === 'zomato' && (
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
          <ChartCard title="Discount % of menu subtotal" caption="Promo + flat-off discount as a % of the dish prices before discount">
            {discountChartData.length > 0 ? (
              <TrendChart data={discountChartData} format="percent" height={200} series={[{ key: 'discountPct', name: 'Discount', color: CHART_SERIES[3] }]} ariaLabel="Zomato discount as a percentage of the menu subtotal by settlement date" />
            ) : (
              <ChartEmpty title="No Zomato settlements with discount data in this period" body=" " />
            )}
          </ChartCard>
          <ChartCard
            title="Promo vs flat-off discount"
            caption="₹ discount by type, per settlement date"
            legend={[{ label: 'Promo', color: CHART_SERIES[0], shape: 'square' }, { label: 'Flat-off', color: CHART_SERIES[3], shape: 'square' }]}
          >
            {discountChartData.length > 0 ? (
              <TrendChart
                data={discountChartData}
                height={200}
                series={[
                  { key: 'promoDiscount', name: 'Promo', color: CHART_SERIES[0], kind: 'bar', stack: 'disc' },
                  { key: 'flatOffDiscount', name: 'Flat-off', color: CHART_SERIES[3], kind: 'bar', stack: 'disc' },
                ]}
                ariaLabel="Zomato promo and flat-off discount in rupees by settlement date"
              />
            ) : (
              <ChartEmpty title="No Zomato settlements with discount data in this period" body=" " />
            )}
          </ChartCard>
          <ChartCard title="Discount by promo code" caption="Top Zomato codes by total ₹ discount in this period, with the orders each applied to" className="lg:col-span-2">
            {discountByConstructData.length > 0 ? (
              <ShareBars items={discountByConstructData.map(row => ({ label: row.construct, value: row.discount, color: CHART_COLORS.primary, valueText: `₹${row.discount.toLocaleString('en-IN')} (${row.orders})` }))} />
            ) : (
              <ChartEmpty title="No Zomato settlements with promo-code data in this period" body=" " />
            )}
          </ChartCard>
        </div>
      )}

      {/* Channel economics: what the same dishes would have earned at the counter */}
      {hasActiveRange && (
        <section className="flex flex-col gap-3" aria-labelledby="channel-econ-title">
          <SectionHeading
            as="h3"
            id="channel-econ-title"
            title="Channel economics"
            caption={`For every real ${platformName} order this period: the same dishes at your counter price, at ${platformName}'s menu price, and what ${platformName} actually paid you`}
          />
          {channelEconomicsData.totalOrders === 0 ? (
            <Card><EmptyState compact icon={FileSpreadsheet} title={`No ${platformName} orders with item-level detail in this period`} /></Card>
          ) : (
            <>
              <Card>
                <MiniFigures
                  items={[
                    { label: 'Counter price', value: `₹${channelEconomicsData.totals.theoreticalOffline.toLocaleString('en-IN')}`, sub: 'latest dine-in price' },
                    { label: `${platformName} menu`, value: `₹${channelEconomicsData.totals.itemSubtotal.toLocaleString('en-IN')}`, sub: 'what it listed them at' },
                    { label: `${platformName} paid you`, value: `₹${channelEconomicsData.totals.netPayout.toLocaleString('en-IN')}`, sub: 'actual net payout' },
                  ]}
                />
              </Card>
              <StatGrid>
                <StatTile
                  label={channelEconomicsData.deficitVsPayout > 0 ? 'Money left on the table' : `${platformName} paid a premium`}
                  value={`₹${Math.abs(channelEconomicsData.deficitVsPayout).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                  caption={channelEconomicsData.deficitVsPayout > 0
                    ? `Counter price − ${platformName} paid you: these dishes would have earned this much more at the counter`
                    : `Counter price − ${platformName} paid you: ${platformName} paid more than the counter price for these dishes`}
                />
                <StatTile
                  label="Online menu mark-up"
                  value={`₹${Math.abs(channelEconomicsData.deficitVsMenuSubtotal).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                  caption={channelEconomicsData.deficitVsMenuSubtotal < 0
                    ? `Counter price − ${platformName} menu price: listed higher than the counter, but not enough to cover the gap`
                    : `Counter price − ${platformName} menu price: listed at or below the counter price`}
                />
              </StatGrid>
              <div className="flex flex-wrap items-center gap-2 text-label text-text-3">
                <span>Based on <span className="num font-semibold text-text-2">{channelEconomicsData.matchedOrders}</span> of {channelEconomicsData.totalOrders} {platformName} orders ({channelEconomicsData.matchRatePct}% matched to item and price data)</span>
                {channelEconomicsData.unmatchedOrders > 0 && <StatusChip tone="neutral">{channelEconomicsData.unmatchedOrders} unmatched</StatusChip>}
                {channelEconomicsData.unpricedOrders > 0 && <StatusChip tone="warning" title={channelEconomicsData.unpricedItemNames.join(', ')}>{channelEconomicsData.unpricedOrders} missing item price</StatusChip>}
              </div>
              <ListGroup>
                <ListRow
                  title="Counter prices used"
                  subtitle={`${channelEconomicsData.latestPricedCount} of ${channelEconomicsData.pricesUsedList.length} dishes priced from the latest counter sales`}
                  onClick={() => setPricesOpen(true)}
                />
              </ListGroup>
              {channelEconomicsData.chartData.length > 0 && (
                <ChartCard
                  title="By settlement date"
                  legend={[
                    { label: 'Counter price', color: CHART_SERIES[1] },
                    { label: `${platformName} menu price`, color: CHART_SERIES[3] },
                    { label: `${platformName} paid you`, color: CHART_SERIES[2] },
                  ]}
                >
                  <TrendChart
                    data={channelEconomicsData.chartData}
                    height={220}
                    series={[
                      { key: 'theoreticalOffline', name: 'Counter price', color: CHART_SERIES[1] },
                      { key: 'itemSubtotal', name: `${platformName} menu price`, color: CHART_SERIES[3] },
                      { key: 'netPayout', name: `${platformName} paid you`, color: CHART_SERIES[2] },
                    ]}
                    ariaLabel={`Counter price, ${platformName} menu price and what ${platformName} paid, by settlement date`}
                  />
                </ChartCard>
              )}
            </>
          )}
          <ResponsiveModal
            open={pricesOpen}
            onOpenChange={setPricesOpen}
            title="Counter prices used"
            description="The newest sale at the counter, or the saved menu price when there is none"
            size="form"
          >
            <ListGroup>
              {channelEconomicsData.pricesUsedList.map(row => (
                <TextRow
                  key={row.name}
                  title={row.name}
                  lines={[
                    `${row.quantity} sold · ${row.source === 'latest' ? `latest sale${row.lastSeen ? ` (${formatDateIN(row.lastSeen, { day: 'numeric', month: 'short' })})` : ''}` : 'saved menu price'}`,
                    row.saved !== null && row.saved !== row.used ? <span className="text-warning">Saved menu: ₹{row.saved}</span> : null,
                  ]}
                  trailing={<span className="num text-body-md font-semibold text-text">₹{row.used}</span>}
                />
              ))}
            </ListGroup>
          </ResponsiveModal>

          {/* Every online platform together */}
          <ListGroup title="All online platforms" footer="Zomato and Swiggy together for this period, the same matched orders as above. Left on the table = counter price − what the platform paid you.">
            {[...allPlatformsEconomics.rows.map(r => ({ ...r, isTotal: false })), { agg: 'total', label: 'Total', ...allPlatformsEconomics.total, isTotal: true }].map(r => (
              <TextRow
                key={r.agg}
                title={r.label}
                lines={[`${r.orders} orders · counter ₹${r.counter.toLocaleString('en-IN')} · menu ₹${r.menu.toLocaleString('en-IN')} · paid ₹${r.paid.toLocaleString('en-IN')}`]}
                trailing={
                  <>
                    <span className={cn('num text-body-md font-semibold', r.counter - r.paid > 0 ? 'text-warning' : 'text-success')}>{leftOnTable(r.counter, r.paid)}</span>
                    <span className="text-caption text-text-3">left on table</span>
                  </>
                }
                className={r.isTotal ? 'bg-surface-2' : undefined}
              />
            ))}
          </ListGroup>
        </section>
      )}

      {/* Are we pricing this right online? - per menu item, for the chosen platform */}
      {hasActiveRange && (
        <section className="flex flex-col gap-3" aria-labelledby="pricing-title">
          <SectionHeading as="h3" id="pricing-title" title={`${platformName}: are we pricing this right?`} caption="What lands in hand per plate online, against the dine-in price of the same item" />
          {!pricing ? (
            <Card><EmptyState compact icon={FileSpreadsheet} title="Needs items total data" body="Upload or re-upload settlements with item-level tracking for this period." /></Card>
          ) : pricingRows.length === 0 ? (
            <Card><EmptyState compact icon={FileSpreadsheet} title={`No ${econPlatform} online sales matched to POS item data in this period`} body="Needs pos-sync data from 2026-08-23 onward." /></Card>
          ) : (
            <>
              <ListGroup className="lg:hidden" footer="Sorted by online pieces sold, most first.">
                {pricingRows.map(r => {
                  const isLoss = (r.marginPct ?? 0) < 0;
                  return (
                    <TextRow
                      key={r.key}
                      title={`${r.label} (${r.piecesPerPlate} pc)`}
                      lines={[
                        `Online ₹${r.onlinePrice.toFixed(1)}${r.hasCatalogPrice && Math.abs(r.realizedPrice - r.onlinePrice) > 0.5 ? ` (billed avg ₹${r.realizedPrice.toFixed(1)})` : ''} · dine-in ₹${r.realPrice.toFixed(1)}`,
                        `Payout ₹${r.effectivePayout.toFixed(1)} a plate`,
                      ]}
                      trailing={
                        <>
                          <span className={cn('num text-body-md font-semibold', isLoss ? 'text-danger' : 'text-success')}>{r.marginPct !== null ? `${r.marginPct >= 0 ? '+' : ''}${r.marginPct.toFixed(0)}%` : '—'}</span>
                          {r.priceIncreasePct !== null && r.priceIncreasePct > 1
                            ? <StatusChip tone="danger">Raise +{r.priceIncreasePct.toFixed(0)}%</StatusChip>
                            : <StatusChip tone="success">Healthy</StatusChip>}
                        </>
                      }
                    />
                  );
                })}
              </ListGroup>
              <div className="hidden lg:block">
                <Table containerClassName="max-h-96 overflow-y-auto">
                  <TableHeader sticky>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead numeric>Online ₹ a plate</TableHead>
                      <TableHead numeric>Dine-in ₹ a plate</TableHead>
                      <TableHead numeric>Payout ₹ a plate</TableHead>
                      <TableHead numeric>Margin</TableHead>
                      <TableHead numeric>Suggested change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pricingRows.map(r => {
                      const isLoss = (r.marginPct ?? 0) < 0;
                      return (
                        <TableRow key={r.key}>
                          <TableCell>{r.label} <span className="text-label text-text-3">({r.piecesPerPlate} pc)</span></TableCell>
                          <TableCell numeric className="text-text-2">
                            ₹{r.onlinePrice.toFixed(1)}
                            {r.hasCatalogPrice && Math.abs(r.realizedPrice - r.onlinePrice) > 0.5 && <span className="block text-caption text-warning">billed avg ₹{r.realizedPrice.toFixed(1)}</span>}
                          </TableCell>
                          <TableCell numeric className="text-text-2">₹{r.realPrice.toFixed(1)}</TableCell>
                          <TableCell numeric className="text-text-2">₹{r.effectivePayout.toFixed(1)}</TableCell>
                          <TableCell numeric className={cn('font-semibold', isLoss ? 'text-danger' : 'text-success')}>{r.marginPct !== null ? `${r.marginPct >= 0 ? '+' : ''}${r.marginPct.toFixed(0)}%` : '—'}</TableCell>
                          <TableCell numeric>
                            {r.priceIncreasePct !== null && r.priceIncreasePct > 1
                              ? <StatusChip tone="danger">Raise +{r.priceIncreasePct.toFixed(0)}%</StatusChip>
                              : <StatusChip tone="success">Healthy</StatusChip>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <ChartCard title="Margin against the dine-in price" caption={rowsCaption(pricingRows.length, pricingChartRows.length)}>
                <TrendChart
                  data={pricingChartRows.map(r => ({ name: r.label, marginPct: r.marginPct !== null ? Math.round(r.marginPct * 10) / 10 : 0 }))}
                  xKey="name"
                  layout="vertical"
                  format="percent"
                  height={Math.max(160, pricingChartRows.length * 30)}
                  categoryWidth={112}
                  series={[{ key: 'marginPct', name: 'Margin vs dine-in price', color: CHART_SERIES[1], kind: 'bar', cellColors: pricingChartRows.map(r => ((r.marginPct ?? 0) < 0 ? 'var(--danger)' : CHART_SERIES[1])) }]}
                  ariaLabel={`${platformName} margin per item against the dine-in price`}
                />
              </ChartCard>
              <p className="text-label text-text-3">
                Discount + GST + commission keep {pricing.payoutPct.toFixed(1)}% of the listing price, then a further ₹{pricing.adSharePerPlate.toFixed(2)} a plate goes to ad spend (the same flat share whether it's a 2 pc burger, a 6 pc plate or a 12 pc combo) - shown separately so ad spend isn't taken off twice.
              </p>
            </>
          )}
        </section>
      )}

      {/* Settlement history - closed until asked for */}
      <ListGroup
        title="Settlement history"
        meta={isHistoryOpen && hasActiveRange ? `${filteredSettlements.length}` : undefined}
        empty={!hasActiveRange
          ? <EmptyState compact icon={FileSpreadsheet} title="Pick a custom date range and press Apply above" />
          : <EmptyState compact icon={FileSpreadsheet} title="No settlements in this date range yet" body={canEdit ? 'Use "Upload settlement" above to add one.' : undefined} />}
        className={isHistoryOpen && hasActiveRange && filteredSettlements.length > 0 ? 'lg:hidden' : undefined}
      >
        {!isHistoryOpen ? (
          <ListRow muted title="Show the settlements in this period" onClick={() => setIsHistoryOpen(true)} chevron="down" aria-expanded={false} />
        ) : hasActiveRange ? (
          filteredSettlements.map(s => (
            <TextRow
              key={s.id}
              title={<span className="capitalize">{s.aggregator} · paid {formatDateIN(s.settlementDate)}</span>}
              lines={[
                `Sales: ${formatSettlementPeriod(s)} · ${s.orderCount} orders`,
                `Order value ${rupees(s.grossSales)} · commission ${rupees(s.netCommission)}${s.adSpend !== undefined ? ` · ads ${rupees(s.adSpend)}` : ''}`,
                s.bankUTR ? `UTR ${s.bankUTR}` : null,
              ]}
              trailing={
                <>
                  <span className="num text-body-md font-semibold text-text">{rupees(s.netPayout)}</span>
                  {canEdit && <IconButton label="Delete settlement" variant="danger-ghost" size="sm" icon={<Trash2 />} disabled={deletingId === s.id} onClick={() => handleDelete(s.id)} />}
                </>
              }
            />
          ))
        ) : null}
      </ListGroup>
      {isHistoryOpen && hasActiveRange && filteredSettlements.length > 0 && (
        <div className="hidden flex-col gap-2 lg:flex">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Settlement date</TableHead>
                <TableHead>Aggregator</TableHead>
                <TableHead numeric>Orders</TableHead>
                <TableHead numeric>Net order value</TableHead>
                <TableHead numeric>Net payout</TableHead>
                <TableHead numeric>Commission</TableHead>
                <TableHead numeric>Ad spend</TableHead>
                <TableHead>Bank UTR</TableHead>
                {canEdit && <TableHead><span className="sr-only">Delete</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSettlements.map(s => (
                <TableRow key={s.id}>
                  <TableCell>
                    <span className="block">{formatDateIN(s.settlementDate)}</span>
                    <span className="block text-label text-text-3">Sales: {formatSettlementPeriod(s)}</span>
                  </TableCell>
                  <TableCell className="capitalize text-text-2">{s.aggregator}</TableCell>
                  <TableCell numeric className="text-text-2">{s.orderCount}</TableCell>
                  <TableCell numeric className="text-text-2">{rupees(s.grossSales)}</TableCell>
                  <TableCell numeric className="font-semibold">{rupees(s.netPayout)}</TableCell>
                  <TableCell numeric className={s.netCommission >= 0 ? undefined : 'text-danger'}>{rupees(s.netCommission)}</TableCell>
                  <TableCell numeric className="text-text-2">{s.adSpend !== undefined ? rupees(s.adSpend) : '—'}</TableCell>
                  <TableCell className="text-label text-text-3">{s.bankUTR}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <IconButton label="Delete settlement" variant="danger-ghost" icon={<Trash2 />} disabled={deletingId === s.id} onClick={() => handleDelete(s.id)} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Upload Settlement Modal */}
      <ResponsiveModal
        open={showUploadModal}
        onOpenChange={setShowUploadModal}
        title="Upload settlement report"
        size="detail"
        footer={
          <Button size="lg" fullWidth leadingIcon={<CheckCircle />} loading={isSaving} disabled={!parsedSettlements || parsedSettlements.length === 0} onClick={handleConfirmSave}>
            Confirm and save
          </Button>
        }
      >
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-text-2 mb-2">Store</label>
                {defaultUploadStoreId ? (
                  <div className="px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-sm text-text">
                    {availableStores.find(s => s.id === defaultUploadStoreId)?.name || defaultUploadStoreId}
                  </div>
                ) : (
                  <select
                    value={uploadStoreId}
                    onChange={(e) => { setUploadStoreId(e.target.value); setSaveError(null); }}
                    className="min-h-11 w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface text-text focus:ring-2 focus:ring-ring focus:border-primary"
                  >
                    <option value="">Select store</option>
                    {availableStores.map(store => (
                      <option key={store.id} value={store.id}>{store.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-text-2 mb-2">Aggregator</label>
                <div className="flex gap-2">
                  {(['zomato', 'swiggy'] as const).map(agg => (
                    <button
                      key={agg}
                      onClick={() => { setUploadAggregator(agg); setParsedSettlements(null); setParseErrors([]); setSaveError(null); setSkippedDuplicates([]); }}
                      className={`min-h-11 flex-1 px-4 py-2.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                        uploadAggregator === agg ? 'bg-primary text-white' : 'bg-surface-2 text-text-2 hover:bg-surface-3'
                      }`}
                    >
                      {agg}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-text-2 mb-2">Settlement File(s) (.xlsx)</label>
                <label className="flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-border-strong rounded-lg cursor-pointer hover:border-primary hover:bg-primary-soft transition-colors">
                  <Upload className="w-5 h-5 text-text-3" />
                  <span className="text-sm text-text-2">
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
                <div className="flex items-center gap-2 text-sm text-text-3">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Parsing file(s)...
                </div>
              )}

              {parseErrors.length > 0 && (
                <div className="bg-danger-soft border-2 border-danger-border rounded-lg p-4 space-y-1.5">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 text-danger flex-shrink-0" />
                    <p className="text-sm font-semibold text-danger">
                      {parseErrors.length} file{parseErrors.length !== 1 ? 's' : ''} couldn't be parsed:
                    </p>
                  </div>
                  <ul className="text-sm text-danger list-disc list-inside pl-8">
                    {parseErrors.map((e, i) => (
                      <li key={i}><span className="font-medium">{e.fileName}</span>: {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {saveError && (
                <div className="bg-danger-soft border-2 border-danger-border rounded-lg p-4 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-danger flex-shrink-0" />
                  <p className="text-sm text-danger whitespace-pre-line">{saveError}</p>
                </div>
              )}

              {skippedDuplicates.length > 0 && (
                <div className="bg-warning-soft border-2 border-warning-border rounded-lg p-4 space-y-1.5">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 text-warning flex-shrink-0" />
                    <p className="text-sm font-semibold text-warning">
                      {skippedDuplicates.length} duplicate settlement{skippedDuplicates.length !== 1 ? 's' : ''} skipped (already saved or already queued):
                    </p>
                  </div>
                  <ul className="text-sm text-warning list-disc list-inside pl-8">
                    {skippedDuplicates.map((d, i) => (
                      <li key={i}><span className="font-medium">{d.fileName}</span> - settlement date {formatDateIN(d.settlementDate)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {parsedSettlements && parsedSettlements.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-text-2">
                    Found {parsedSettlements.length} settlement{parsedSettlements.length !== 1 ? 's' : ''} from {new Set(parsedSettlements.map(s => s.sourceFileName)).size} file(s) - review before saving:
                  </p>
                  {parsedSettlements.map((s, i) => (
                    <div key={i} className={`border-2 rounded-lg p-4 space-y-1.5 ${s.replacesId ? 'bg-warning-soft border-warning-border' : 'bg-primary-soft border-border-strong'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs text-text-3 truncate">{s.sourceFileName}</span>
                        <button
                          onClick={() => setParsedSettlements(prev => (prev || []).filter((_, idx) => idx !== i))}
                          className="min-h-11 p-1 text-text-3 hover:text-danger rounded flex-shrink-0"
                          title="Remove this settlement from the queue"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {s.replacesId && (
                        <p className="text-xs font-semibold text-warning bg-warning-soft border border-warning-border rounded px-2 py-1">
                          Replaces an existing settlement already uploaded for this date/UTR - the old one will be overwritten.
                        </p>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-text-2">Settlement Date</span>
                        <span className="font-medium text-text">{formatDateIN(s.settlementDate, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-2">Sales Period</span>
                        <span className="font-medium text-text">{formatSettlementPeriod(s)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-2">Bank UTR</span>
                        <span className="font-medium text-text">{s.bankUTR || '-'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-2">Orders</span>
                        <span className="font-medium text-text">{s.orderCount}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-2">Net Order Value</span>
                        <span className="font-medium text-text">₹{s.grossSales.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-2">Net Payout</span>
                        <span className="font-semibold text-info">₹{s.netPayout.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm pt-1.5 border-t border-border-strong">
                        <span className="text-text-2">Net Commission</span>
                        <span className={`font-semibold ${s.netCommission >= 0 ? 'text-primary' : 'text-danger'}`}>₹{s.netCommission.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-2">Ad Spend</span>
                        <span className="font-medium text-info">
                          {s.adSpend !== undefined ? `₹${s.adSpend.toFixed(2)}` : 'not found in file'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
      </ResponsiveModal>
    </div>
  );
}
