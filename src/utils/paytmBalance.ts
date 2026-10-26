// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for the store's Online Cash (Paytm/UPI) balance.
//
// This is a verbatim extraction of the formula that used to live only inside
// SalesManagement.tsx's `calculatePaytmBalance` useMemo. Both the store-incharge
// data-entry form (SalesManagement) and the owner-facing read-only view
// (SalesView) now call this, so the two screens can never drift apart again -
// which is exactly the bug this replaces (they disagreed by ₹27,000 on 31 Aug).
//
// Behaviour is intentionally identical to the old SalesManagement code, with ONE
// deliberate change: employee/contract payouts are only subtracted when they were
// actually paid out of the Paytm balance (`paidFrom === 'paytm'`, or missing =
// legacy = assumed Paytm). A payout marked 'bank' or 'cash' no longer drains this
// figure.
// ─────────────────────────────────────────────────────────────────────────────

import { addDays } from './timezone';

const isCommissionEntry = (item: any): boolean =>
  (item?.category === 'service_charge' && item?.description?.includes('Aggregator Commission')) ||
  item?.category === 'commission'; // legacy format

// A payout counts against the Paytm balance unless it was explicitly settled from
// somewhere else. Undefined `paidFrom` = a record created before the field existed,
// back when every payout was implicitly assumed to come out of Paytm.
const payoutHitsPaytm = (p: any): boolean => p?.paidFrom == null || p.paidFrom === 'paytm';

export interface PaytmBalanceInput {
  salesData: any[];
  overheads: any[];
  aggregatorSettlements: any[];
  onlinePayoutData: any[]; // legacy manual Swiggy/Zomato daily payout entries
  onlineLoans: any[];
  employeePayouts: any[];
  topupRequests: any[];
  onlineCashRecalibrations: any[];
  selectedDate: string; // YYYY-MM-DD
  effectiveStoreId: string | null | undefined;
  // "Today's" values. In the entry form these come from the live form fields; in
  // the read-only view they come from the saved sales record for that day.
  todaysPaytmReceived: number;
  todaysUsedOnlineMoney: number;
  // The store's latest recalibration, if the caller already has it loaded (the
  // entry form does, via its own API call). When omitted, it's derived from
  // `onlineCashRecalibrations`.
  lastOnlineRecalibration?: { month?: string; date: string; actualBalance: number } | null;
}

export interface PaytmBalanceResult {
  balance: number;
  /** Where the running total started from. */
  source: 'carry-forward' | 'recalibration' | 'zero';
  /** The date the running total is anchored to (a prior sales day, or a recalibration date). */
  startDate: string | null;
  startingBalance: number;
}

export function computeExpectedPaytmBalance(input: PaytmBalanceInput): PaytmBalanceResult {
  const {
    salesData, overheads, aggregatorSettlements, onlinePayoutData, onlineLoans,
    employeePayouts, topupRequests, onlineCashRecalibrations,
    selectedDate, effectiveStoreId, todaysPaytmReceived, todaysUsedOnlineMoney,
  } = input;

  const previousDateStr = addDays(selectedDate, -1);

  const storeFilteredSales = effectiveStoreId
    ? salesData.filter((s) => s.storeId === effectiveStoreId)
    : salesData;

  // ── Branch A: carry forward from the most recent prior day that has a real
  //    (physically reconciled / auto-synced) actualPaytmBalance. This is the path
  //    that runs on virtually every real day.
  const previousDaySales = effectiveStoreId
    ? salesData.find((s) => s.date === previousDateStr && s.storeId === effectiveStoreId)
    : salesData.find((s) => s.date === previousDateStr);
  const latestPriorPaytmSales = [...storeFilteredSales]
    .filter((s) => s.date < selectedDate && s.actualPaytmBalance !== undefined && s.actualPaytmBalance !== null)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const carryForwardPaytmSales =
    previousDaySales?.actualPaytmBalance !== undefined && previousDaySales.actualPaytmBalance !== null
      ? previousDaySales
      : latestPriorPaytmSales;

  // A physically-verified recalibration on or before the selected date can be a MORE
  // RECENT anchor than the last sales-record balance - when it is, it wins. Same rule
  // the backend cascade uses (cascadeRecomputePaytmBalances: "whichever is
  // chronologically most recent - a verified recalibration or the last actual balance
  // on a sales record"). Without this, a fresh recalibration was silently ignored on
  // every day that already had a prior actualPaytmBalance to carry forward.
  const latestRecalOnOrBefore = [...(onlineCashRecalibrations || [])]
    .filter((r) => (effectiveStoreId ? r.storeId === effectiveStoreId : true) && typeof r.date === 'string' && r.date <= selectedDate && typeof r.actualBalance === 'number')
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const salesAnchorDate = carryForwardPaytmSales?.actualPaytmBalance != null ? carryForwardPaytmSales.date : null;
  const useRecalAnchor = !!latestRecalOnOrBefore && (!salesAnchorDate || latestRecalOnOrBefore.date >= salesAnchorDate);

  const emp = (arr: any[]) =>
    (effectiveStoreId ? arr.filter((p) => !p.storeId || p.storeId === effectiveStoreId) : arr)
      .filter(payoutHitsPaytm);

  // The end-of-day balance for the recalibration date itself: the physically-counted
  // figure PLUS only what moved after the count. Same-day cash top-ups / online-money
  // usage that predate the count are already inside it and are NOT re-subtracted.
  // This is the backend's `effectiveRecalBalance`, ported. Used both when the recal IS
  // the selected day, and as the anchor value for every day after it.
  //
  // Settlements count strictly by settlementDate (the real bank-credit date, per the
  // aggregator's own UTR) vs. the recal date - NOT by when the settlement file was
  // uploaded into the app. A settlement dated on/before the recal date is assumed
  // already inside the physical count, however late its file gets uploaded; only a
  // settlement dated AFTER the recal (or on the recal date itself, treated as landing
  // after an early-morning count) still needs adding. An earlier version of this
  // credited a settlement based on upload time instead - meant to catch aggregator
  // money genuinely still in transit at count time - but that conflated "when the
  // data was entered" with "when the money arrived", and double-counted settlements
  // that a store incharge simply hadn't gotten around to uploading yet even though the
  // money (and the physical count) already had it. Confirmed wrong with the business
  // owner: a settlement dated before a recalibration is always already in the count.
  const recalDayEndBalance = (recal: any): number => {
    const recalTs: string | null = recal.timestamp || recal.createdAt || null;
    const recalDate: string = recal.date;
    const recalDaySale = storeFilteredSales.find((s) => s.date === recalDate);
    // On the recal day itself the caller's live "today" value is freshest; for a later
    // day we read the recal day's own saved sales record.
    const recalDayPaytm = recalDate === selectedDate ? todaysPaytmReceived : (recalDaySale?.paytmAmount ?? 0);
    const recalDayAgg = (aggregatorSettlements || [])
      .filter((s) => (effectiveStoreId ? s.storeId === effectiveStoreId : true) && s.settlementDate === recalDate)
      .reduce((sum, s) => sum + (s.netPayout || 0), 0);
    const recalDayContractPayouts = emp(employeePayouts)
      .filter((p) => p.date === recalDate)
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    const lateTopups = recalTs
      ? topupRequests
          .filter((t) => (effectiveStoreId ? t.storeId === effectiveStoreId : true) && t.status === 'approved' && t.date === recalDate && t.approvedAt && t.approvedAt > recalTs)
          .reduce((sum, t) => sum + (t.requestedAmount || 0), 0)
      : 0;
    return recal.actualBalance + recalDayPaytm + recalDayAgg - recalDayContractPayouts - lateTopups;
  };

  if (useRecalAnchor && latestRecalOnOrBefore.date === selectedDate) {
    return {
      balance: recalDayEndBalance(latestRecalOnOrBefore),
      source: 'recalibration',
      startDate: selectedDate,
      startingBalance: latestRecalOnOrBefore.actualBalance,
    };
  }

  if (useRecalAnchor || (carryForwardPaytmSales && carryForwardPaytmSales.actualPaytmBalance != null)) {
    const startingBalance: number = useRecalAnchor ? recalDayEndBalance(latestRecalOnOrBefore) : carryForwardPaytmSales.actualPaytmBalance;
    const startDate: string = useRecalAnchor ? latestRecalOnOrBefore.date : carryForwardPaytmSales.date;

    const historicalPaytmReceived = storeFilteredSales
      .filter((s) => s.date > startDate && s.date < selectedDate)
      .reduce((sum, s) => sum + (s.paytmAmount ?? 0), 0);

    const storeFilteredPayouts = effectiveStoreId
      ? onlinePayoutData.filter((p) => p.storeId === effectiveStoreId)
      : onlinePayoutData;
    const onlinePayoutsSince = storeFilteredPayouts
      .filter((p) => p.date > startDate && p.date <= selectedDate)
      .reduce((sum, p) => sum + (p.swiggyPayout ?? 0) + (p.zomatoPayout ?? 0), 0);

    const storeFilteredAggregatorSettlements = effectiveStoreId
      ? (aggregatorSettlements || []).filter((s) => s.storeId === effectiveStoreId)
      : (aggregatorSettlements || []);
    const aggregatorPayoutsSince = storeFilteredAggregatorSettlements
      .filter((s) => s.settlementDate > startDate && s.settlementDate <= selectedDate)
      .reduce((sum, s) => sum + (s.netPayout || 0), 0);

    const storeFilteredLoansForToday = effectiveStoreId
      ? onlineLoans.filter((l) => l.storeId === effectiveStoreId)
      : onlineLoans;
    const todaysLoansReceived = storeFilteredLoansForToday
      .filter((l) => l.loanDate > startDate && l.loanDate <= selectedDate && (l.status === 'active' || l.status === 'repaid'))
      .reduce((sum, l) => sum + l.loanAmount, 0);
    const todaysLoanRepayments = storeFilteredLoansForToday
      .filter((l) => l.status === 'repaid' && l.repaymentDate && l.repaymentDate > startDate && l.repaymentDate <= selectedDate)
      .reduce((sum, l) => sum + l.repaidAmount, 0);

    const historicalUsedOnlineMoney = storeFilteredSales
      .filter((s) => s.date > startDate && s.date < selectedDate)
      .reduce((sum, s) => sum + (s.usedOnlineMoney || 0), 0);

    const historicalProductionTopups = topupRequests
      .filter((t) => (effectiveStoreId ? t.storeId === effectiveStoreId : true) && t.reason === 'production_inventory' && t.status === 'approved' && t.date > startDate && t.date < selectedDate)
      .reduce((sum, t) => sum + (t.requestedAmount || 0), 0);
    const todaysProductionTopups = topupRequests
      .filter((t) => (effectiveStoreId ? t.storeId === effectiveStoreId : true) && t.reason === 'production_inventory' && t.status === 'approved' && t.date === selectedDate)
      .reduce((sum, t) => sum + (t.requestedAmount || 0), 0);

    const storeFilteredOverheadForCarry = effectiveStoreId
      ? overheads.filter((o) => o.storeId === effectiveStoreId)
      : overheads;
    const commissionSince = storeFilteredOverheadForCarry
      .filter((o) => isCommissionEntry(o) && o.date > startDate && o.date <= selectedDate)
      .reduce((sum, o) => {
        const paymentMethod = o.paymentMethod || 'online';
        if (paymentMethod === 'online') return sum + (o.amount || 0);
        if (paymentMethod === 'both') return sum + (o.onlineAmount || 0);
        return sum;
      }, 0);

    const empPayouts = emp(employeePayouts);
    const historicalEmployeePayouts = empPayouts
      .filter((p) => p.date > startDate && p.date < selectedDate)
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    const todaysEmployeePayouts = empPayouts
      .filter((p) => p.date === selectedDate)
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const balance =
      startingBalance + historicalPaytmReceived + todaysPaytmReceived + onlinePayoutsSince + aggregatorPayoutsSince + todaysLoansReceived
      - historicalUsedOnlineMoney - todaysUsedOnlineMoney - historicalProductionTopups - todaysProductionTopups
      - commissionSince - todaysLoanRepayments - historicalEmployeePayouts - todaysEmployeePayouts;

    return { balance, source: 'carry-forward', startDate, startingBalance };
  }

  // ── Branch B: no prior actualPaytmBalance anywhere - anchor to a recalibration
  //    for the selected month if one exists, else start from zero.
  const selectedMonth = selectedDate.slice(0, 7);
  const derivedRecal = input.lastOnlineRecalibration !== undefined
    ? input.lastOnlineRecalibration
    : [...(onlineCashRecalibrations || [])]
        .filter((r) => (effectiveStoreId ? r.storeId === effectiveStoreId : true))
        .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  const hasRecalibrationThisMonth = !!derivedRecal && (derivedRecal.month ?? derivedRecal.date.slice(0, 7)) === selectedMonth;

  const startDate = hasRecalibrationThisMonth ? derivedRecal!.date : '2000-01-01';
  const startingBalance = hasRecalibrationThisMonth ? derivedRecal!.actualBalance : 0;

  const historicalPaytmReceived = storeFilteredSales
    .filter((s) => s.date >= startDate && s.date < selectedDate)
    .reduce((sum, s) => sum + (s.paytmAmount ?? 0), 0);
  const allPaytmReceived = historicalPaytmReceived + todaysPaytmReceived;

  const storeFilteredPayouts = effectiveStoreId
    ? onlinePayoutData.filter((p) => p.storeId === effectiveStoreId)
    : onlinePayoutData;
  const historicalOnlinePayouts = storeFilteredPayouts
    .filter((p) => p.date >= startDate && p.date < selectedDate)
    .reduce((sum, p) => sum + (p.swiggyPayout ?? 0) + (p.zomatoPayout ?? 0), 0);
  const todaysPayoutData = storeFilteredPayouts.find((p) => p.date === selectedDate);
  const todaysOnlinePayouts = todaysPayoutData
    ? (todaysPayoutData.swiggyPayout ?? 0) + (todaysPayoutData.zomatoPayout ?? 0)
    : 0;
  const allOnlinePayouts = historicalOnlinePayouts + todaysOnlinePayouts;

  const storeFilteredAggregatorSettlementsB = effectiveStoreId
    ? (aggregatorSettlements || []).filter((s) => s.storeId === effectiveStoreId)
    : (aggregatorSettlements || []);
  const historicalAggregatorPayouts = storeFilteredAggregatorSettlementsB
    .filter((s) => s.settlementDate >= startDate && s.settlementDate < selectedDate)
    .reduce((sum, s) => sum + (s.netPayout || 0), 0);
  const todaysAggregatorPayout = storeFilteredAggregatorSettlementsB
    .filter((s) => s.settlementDate === selectedDate)
    .reduce((sum, s) => sum + (s.netPayout || 0), 0);
  const allAggregatorPayouts = historicalAggregatorPayouts + todaysAggregatorPayout;

  const storeFilteredOverhead = effectiveStoreId
    ? overheads.filter((o) => o.storeId === effectiveStoreId)
    : overheads;
  const allCommission = storeFilteredOverhead
    .filter((o) => isCommissionEntry(o) && o.date >= startDate && o.date < selectedDate)
    .reduce((sum, o) => {
      const paymentMethod = o.paymentMethod || 'online';
      if (paymentMethod === 'online') return sum + (o.amount || 0);
      if (paymentMethod === 'both') return sum + (o.onlineAmount || 0);
      return sum;
    }, 0);

  const historicalUsedOnlineMoney = storeFilteredSales
    .filter((s) => s.date >= startDate && s.date < selectedDate)
    .reduce((sum, s) => sum + (s.usedOnlineMoney || 0), 0);
  const allUsedOnlineMoney = historicalUsedOnlineMoney + todaysUsedOnlineMoney;

  const historicalProductionTopups = topupRequests
    .filter((t) => (effectiveStoreId ? t.storeId === effectiveStoreId : true) && t.reason === 'production_inventory' && t.status === 'approved' && t.date >= startDate && t.date < selectedDate)
    .reduce((sum, t) => sum + (t.requestedAmount || 0), 0);
  const todaysProductionTopups = topupRequests
    .filter((t) => (effectiveStoreId ? t.storeId === effectiveStoreId : true) && t.reason === 'production_inventory' && t.status === 'approved' && t.date === selectedDate)
    .reduce((sum, t) => sum + (t.requestedAmount || 0), 0);
  const allProductionTopups = historicalProductionTopups + todaysProductionTopups;

  const storeFilteredLoans = effectiveStoreId
    ? onlineLoans.filter((l) => l.storeId === effectiveStoreId)
    : onlineLoans;
  const loansReceived = storeFilteredLoans
    .filter((l) => l.loanDate >= startDate && l.loanDate < selectedDate && (l.status === 'active' || l.status === 'repaid'))
    .reduce((sum, l) => sum + l.loanAmount, 0);
  const loanRepayments = storeFilteredLoans
    .filter((l) => l.repaidAmount > 0 && l.loanDate < selectedDate)
    .reduce((sum, l) => sum + l.repaidAmount, 0);

  const empPayouts = emp(employeePayouts);
  const historicalEmployeePayouts = empPayouts
    .filter((p) => p.date >= startDate && p.date < selectedDate)
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const todaysEmployeePayouts = empPayouts
    .filter((p) => p.date === selectedDate)
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const allEmployeePayouts = historicalEmployeePayouts + todaysEmployeePayouts;

  const balance =
    startingBalance + allPaytmReceived + allOnlinePayouts + allAggregatorPayouts + loansReceived
    - allUsedOnlineMoney - allProductionTopups - allCommission - loanRepayments - allEmployeePayouts;

  return {
    balance,
    source: hasRecalibrationThisMonth ? 'recalibration' : 'zero',
    startDate: hasRecalibrationThisMonth ? startDate : null,
    startingBalance,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction-level ledger for the Online Cash (Paytm/UPI) balance - every credit
// and debit that moves the figure, in date order, with a running balance. Same
// data sources and sign conventions as computeExpectedPaytmBalance above, so the
// ledger's closing balance always ties out to that function's result.
// ─────────────────────────────────────────────────────────────────────────────

export interface PaytmLedgerLine {
  date: string;
  label: string;
  credit: number; // 0 for a debit line
  debit: number;  // 0 for a credit line
  balance: number; // running balance AFTER this line
}

export interface PaytmLedgerResult {
  anchorDate: string;
  anchorLabel: string;
  anchorBalance: number;
  lines: PaytmLedgerLine[];
  closingBalance: number;
}

export function computePaytmLedger(
  input: Omit<PaytmBalanceInput, 'selectedDate' | 'todaysPaytmReceived' | 'todaysUsedOnlineMoney'>,
  fromDate: string,
  toDate: string,
): PaytmLedgerResult {
  const {
    salesData, overheads, aggregatorSettlements, onlinePayoutData, onlineLoans,
    employeePayouts, topupRequests, onlineCashRecalibrations, effectiveStoreId,
  } = input;

  const sameStore = (id: any) => (effectiveStoreId ? id === effectiveStoreId : true);
  const storeSales = salesData.filter((s) => sameStore(s.storeId)).slice().sort((a, b) => a.date.localeCompare(b.date));

  // Anchor: latest of {recalibration, sales-record actualPaytmBalance} strictly before fromDate.
  let anchorDate = fromDate;
  let anchorBalance = 0;
  let anchorLabel = 'Opening (no prior balance on record)';
  const priorSales = storeSales
    .filter((s) => s.date < fromDate && s.actualPaytmBalance != null)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (priorSales) {
    anchorDate = priorSales.date;
    anchorBalance = priorSales.actualPaytmBalance;
    anchorLabel = `Balance carried from ${priorSales.date}`;
  }
  const priorRecal = [...(onlineCashRecalibrations || [])]
    .filter((r) => sameStore(r.storeId) && typeof r.date === 'string' && r.date < fromDate && typeof r.actualBalance === 'number')
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (priorRecal && (!priorSales || priorRecal.date >= priorSales.date)) {
    // Anchor at the recal-day END balance: counted figure + that day's post-count
    // Paytm receipts / aggregator payouts, minus that day's Paytm-paid salary and any
    // top-up approved after the count. (Same as computeExpectedPaytmBalance's
    // recalDayEndBalance.)
    const rd = priorRecal.date;
    const rts: string | null = priorRecal.timestamp || priorRecal.createdAt || null;
    const rdSale = storeSales.find((s) => s.date === rd);
    const rdAgg = (aggregatorSettlements || [])
      .filter((s) => sameStore(s.storeId) && s.settlementDate === rd)
      .reduce((sum, s) => sum + (s.netPayout || 0), 0);
    const rdSalary = (employeePayouts || [])
      .filter((p) => (effectiveStoreId ? (!p.storeId || p.storeId === effectiveStoreId) : true) && payoutHitsPaytm(p) && p.date === rd)
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    const rdLateTopups = rts
      ? (topupRequests || [])
          .filter((t) => sameStore(t.storeId) && t.status === 'approved' && t.date === rd && t.approvedAt && t.approvedAt > rts)
          .reduce((sum, t) => sum + (t.requestedAmount || 0), 0)
      : 0;
    anchorDate = rd;
    anchorBalance = priorRecal.actualBalance + (rdSale?.paytmAmount ?? 0) + rdAgg - rdSalary - rdLateTopups;
    anchorLabel = `Physically counted on ${rd}`;
  }

  let balance = anchorBalance;
  const lines: PaytmLedgerLine[] = [];
  const credit = (date: string, label: string, amount: number) => {
    if (Math.abs(amount) < 0.005) return;
    balance += amount;
    lines.push({ date, label, credit: amount, debit: 0, balance });
  };
  const debit = (date: string, label: string, amount: number) => {
    if (Math.abs(amount) < 0.005) return;
    balance -= amount;
    lines.push({ date, label, credit: 0, debit: amount, balance });
  };

  // Every date from the day after the anchor through toDate.
  let cursor = addDays(anchorDate, 1);
  while (cursor <= toDate) {
    const d = cursor;

    const sale = storeSales.find((s) => s.date === d);

    // Recalibration on this day resets the balance to the physically-counted figure.
    // Everything that happened up to the count moment is already inside it, so on the
    // recal day only the count reset, that day's Paytm receipts / aggregator payouts /
    // Paytm-paid salary, and any top-up approved AFTER the count are shown.
    const recal = (onlineCashRecalibrations || []).find((r) => sameStore(r.storeId) && r.date === d && typeof r.actualBalance === 'number');
    if (recal) {
      const delta = recal.actualBalance - balance;
      balance = recal.actualBalance;
      lines.push({
        date: d,
        label: `Recalibration — counted balance set to ₹${recal.actualBalance.toLocaleString()}${Math.abs(delta) >= 0.005 ? ` (adjustment ${delta > 0 ? '+' : '−'}₹${Math.abs(delta).toLocaleString()})` : ''}`,
        credit: delta > 0 ? delta : 0,
        debit: delta < 0 ? -delta : 0,
        balance,
      });
      if (sale) credit(d, 'Paytm / UPI received (counter)', sale.paytmAmount ?? 0);
      const recalTs: string | null = recal.timestamp || recal.createdAt || null;
      (aggregatorSettlements || [])
        .filter((s) => sameStore(s.storeId) && s.settlementDate === d)
        .forEach((s) => {
          const agg = `${(s.aggregator || 'Aggregator')[0].toUpperCase()}${(s.aggregator || 'aggregator').slice(1)}`;
          credit(d, `${agg} settlement payout`, s.netPayout || 0);
        });
      (employeePayouts || [])
        .filter((p) => (effectiveStoreId ? (!p.storeId || p.storeId === effectiveStoreId) : true) && payoutHitsPaytm(p) && p.date === d)
        .forEach((p) => debit(d, `Salary / payout — ${p.employeeName || p.employeeId || 'staff'}`, p.amount || 0));
      if (recalTs) {
        (topupRequests || [])
          .filter((t) => sameStore(t.storeId) && t.status === 'approved' && t.date === d && t.approvedAt && t.approvedAt > recalTs)
          .forEach((t) => debit(d, `Cash top-up ${t.reason === 'production_inventory' ? 'to production house' : 'to store till'} (approved after count)`, t.requestedAmount || 0));
      }
      cursor = addDays(cursor, 1);
      continue;
    }

    // ── Credits ──
    if (sale) credit(d, 'Paytm / UPI received (counter)', sale.paytmAmount ?? 0);

    (aggregatorSettlements || [])
      .filter((s) => sameStore(s.storeId) && s.settlementDate === d)
      .forEach((s) => credit(d, `${(s.aggregator || 'Aggregator')[0].toUpperCase()}${(s.aggregator || 'aggregator').slice(1)} settlement payout`, s.netPayout || 0));

    (onlinePayoutData || [])
      .filter((p) => sameStore(p.storeId) && p.date === d)
      .forEach((p) => credit(d, 'Swiggy/Zomato payout (manual entry)', (p.swiggyPayout ?? 0) + (p.zomatoPayout ?? 0)));

    (onlineLoans || [])
      .filter((l) => sameStore(l.storeId) && l.loanDate === d && (l.status === 'active' || l.status === 'repaid'))
      .forEach((l) => credit(d, `Loan received${l.investorName ? ` from ${l.investorName}` : ''}`, l.loanAmount || 0));

    // ── Debits ──
    if (sale) debit(d, 'Cash top-up to store till (from Paytm)', sale.usedOnlineMoney ?? 0);

    (topupRequests || [])
      .filter((t) => sameStore(t.storeId) && t.reason === 'production_inventory' && t.status === 'approved' && t.date === d)
      .forEach((t) => debit(d, 'Cash top-up to production house (from Paytm)', t.requestedAmount || 0));

    (overheads || [])
      .filter((o) => sameStore(o.storeId) && isCommissionEntry(o) && o.date === d)
      .forEach((o) => {
        const pm = o.paymentMethod || 'online';
        const amt = pm === 'online' ? (o.amount || 0) : pm === 'both' ? (o.onlineAmount || 0) : 0;
        debit(d, 'Aggregator commission', amt);
      });

    (employeePayouts || [])
      .filter((p) => (effectiveStoreId ? (!p.storeId || p.storeId === effectiveStoreId) : true) && payoutHitsPaytm(p) && p.date === d)
      .forEach((p) => debit(d, `Salary / payout — ${p.employeeName || p.employeeId || 'staff'}`, p.amount || 0));

    (onlineLoans || [])
      .filter((l) => sameStore(l.storeId) && l.status === 'repaid' && l.repaymentDate === d && (l.repaidAmount || 0) > 0)
      .forEach((l) => debit(d, `Loan repayment${l.investorName ? ` to ${l.investorName}` : ''}`, l.repaidAmount || 0));

    cursor = addDays(cursor, 1);
  }

  return { anchorDate, anchorLabel, anchorBalance, lines, closingBalance: balance };
}
