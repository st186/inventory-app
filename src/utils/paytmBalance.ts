// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for the store's Online Cash (Paytm/UPI) balance.
//
// Both the store-incharge data-entry form (SalesManagement) and the owner-facing read-only
// view (SalesView) call this, so the two screens can never drift apart again - which is
// exactly the bug this replaced (they disagreed by ₹27,000 on 31 Aug). The rules themselves
// (what counts, on which day, which saved figures are real) live in ./paytmRules.ts, which the
// server's cascadeRecomputePaytmBalances runs too, so the balance it stores on every sales row
// matches what these screens show.
// ─────────────────────────────────────────────────────────────────────────────

import { addDays } from './timezone';
import {
  approvedAfterCount, expectedPaytmOn, isCommissionEntry, loanCountsTowardPaytm, loanRepayments,
  paytmAnchorBefore, paytmMovement, paytmSourcesForStore, payoutHitsPaytm, recalibrationOn, type PaytmSources,
} from './paytmRules';

export interface PaytmBalanceInput {
  salesData: any[];
  overheads: any[];
  aggregatorSettlements: any[];
  // Old hand-typed Swiggy/Zomato payout entries only - never the uploaded settlements, which
  // already come in through aggregatorSettlements (passing them here too counted every
  // settlement twice).
  onlinePayoutData: any[];
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
}

export interface PaytmBalanceResult {
  balance: number;
  /** Where the running total started from. */
  source: 'carry-forward' | 'recalibration' | 'zero';
  /** The date the running total is anchored to (a prior sales day, or a recalibration date). */
  startDate: string | null;
  startingBalance: number;
}

const toSources = (input: Omit<PaytmBalanceInput, 'selectedDate' | 'todaysPaytmReceived' | 'todaysUsedOnlineMoney'>): PaytmSources =>
  paytmSourcesForStore({
    sales: (input.salesData || []).filter((s) => typeof s?.date === 'string'),
    settlements: input.aggregatorSettlements || [],
    payouts: input.employeePayouts || [],
    topups: input.topupRequests || [],
    loans: input.onlineLoans || [],
    overheads: input.overheads || [],
    recalibrations: input.onlineCashRecalibrations || [],
    legacyPayouts: input.onlinePayoutData || [],
  }, input.effectiveStoreId);

export function computeExpectedPaytmBalance(input: PaytmBalanceInput): PaytmBalanceResult {
  const { selectedDate, todaysPaytmReceived, todaysUsedOnlineMoney } = input;
  // The latest saved day balance or recalibration before the selected date carries forward,
  // plus everything since. Starting from the last saved snapshot instead of from account
  // inception is deliberate: a from-scratch recompute was tried and reverted - this store's
  // early data has unexplained resets (a flat-zero month, a balance dropping to 0 with no
  // matching loan or withdrawal) that made a full re-sum wildly wrong. If the snapshot chain
  // itself needs correcting, that's what a recalibration (a fresh physical count) is for.
  const result = expectedPaytmOn(toSources(input), selectedDate, {
    date: selectedDate,
    paytmReceived: todaysPaytmReceived,
    usedOnlineMoney: todaysUsedOnlineMoney,
  });

  if (result.recalibration) {
    return { balance: result.balance, source: 'recalibration', startDate: selectedDate, startingBalance: result.recalibration.actualBalance };
  }
  if (result.anchor) {
    return { balance: result.balance, source: 'carry-forward', startDate: result.anchor.date, startingBalance: result.anchor.balance };
  }
  // No saved balance or recalibration anywhere before this date: everything ever recorded,
  // from zero.
  return { balance: result.balance, source: 'zero', startDate: null, startingBalance: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction-level ledger for the Online Cash (Paytm/UPI) balance - every credit
// and debit that moves the figure, in date order, with a running balance. Same
// rules (./paytmRules.ts) as computeExpectedPaytmBalance above, so the ledger's closing
// balance always ties out to that function's result.
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
  const src = toSources(input);
  const aggregatorLabel = (s: any) => `${(s.aggregator || 'Aggregator')[0].toUpperCase()}${(s.aggregator || 'aggregator').slice(1)} settlement payout`;

  // Anchor: latest of {recalibration, real saved day balance} strictly before fromDate. A
  // recalibration anchor is its day-END balance: counted figure + that day's Paytm receipts /
  // aggregator payouts, minus Paytm-paid salary and any top-up approved after the count.
  let anchorDate: string;
  let anchorBalance: number;
  let anchorLabel: string;
  const anchor = paytmAnchorBefore(src, fromDate);
  if (anchor) {
    anchorDate = anchor.date;
    anchorBalance = anchor.balance;
    anchorLabel = anchor.source === 'recalibration' ? `Physically counted on ${anchor.date}` : `Balance carried from ${anchor.date}`;
  } else {
    // Nothing to carry from: open with everything recorded before the range - the same
    // from-zero sum computeExpectedPaytmBalance falls back to, so the closing still ties out.
    anchorDate = addDays(fromDate, -1);
    anchorBalance = paytmMovement(src, '', anchorDate).net;
    anchorLabel = 'Opening (no prior balance on record)';
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
    const daySales = src.sales.filter((s) => s.date === d);

    // Recalibration on this day resets the balance to the physically-counted figure.
    // Everything that happened up to the count moment is already inside it, so on the
    // recal day only the count reset, that day's Paytm receipts / aggregator payouts /
    // Paytm-paid salary, and any top-up approved AFTER the count are shown.
    const recal = recalibrationOn(src, d);
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
      daySales.forEach((s) => credit(d, 'Paytm / UPI received (counter)', s.paytmAmount ?? 0));
      src.settlements
        .filter((s) => s.settlementDate === d)
        .forEach((s) => credit(d, aggregatorLabel(s), s.netPayout || 0));
      src.payouts
        .filter((p) => payoutHitsPaytm(p) && p.date === d)
        .forEach((p) => debit(d, `Salary / payout — ${p.employeeName || p.employeeId || 'staff'}`, p.amount || 0));
      src.topups
        .filter((t) => t.status === 'approved' && t.date === d && approvedAfterCount(t, recal))
        .forEach((t) => debit(d, `Cash top-up ${t.reason === 'production_inventory' ? 'to production house' : 'to store till'} (approved after count)`, t.requestedAmount || 0));
      cursor = addDays(cursor, 1);
      continue;
    }

    // ── Credits ──
    daySales.forEach((s) => credit(d, 'Paytm / UPI received (counter)', s.paytmAmount ?? 0));

    src.settlements
      .filter((s) => s.settlementDate === d)
      .forEach((s) => credit(d, aggregatorLabel(s), s.netPayout || 0));

    (src.legacyPayouts || [])
      .filter((p) => p.date === d)
      .forEach((p) => credit(d, 'Swiggy/Zomato payout (manual entry)', (p.swiggyPayout ?? 0) + (p.zomatoPayout ?? 0)));

    src.loans
      .filter((l) => l.loanDate === d && loanCountsTowardPaytm(l))
      .forEach((l) => credit(d, `Loan received${l.investorName ? ` from ${l.investorName}` : ''}`, l.loanAmount || 0));

    // ── Debits ──
    daySales.forEach((s) => debit(d, 'Cash top-up to store till (from Paytm)', s.usedOnlineMoney ?? 0));

    src.topups
      .filter((t) => t.reason === 'production_inventory' && t.status === 'approved' && t.date === d)
      .forEach((t) => debit(d, 'Cash top-up to production house (from Paytm)', t.requestedAmount || 0));

    src.overheads
      .filter((o) => isCommissionEntry(o) && o.date === d)
      .forEach((o) => {
        const pm = o.paymentMethod || 'online';
        const amt = pm === 'online' ? (o.amount || 0) : pm === 'both' ? (o.onlineAmount || 0) : 0;
        debit(d, 'Aggregator commission', amt);
      });

    src.payouts
      .filter((p) => payoutHitsPaytm(p) && p.date === d)
      .forEach((p) => debit(d, `Salary / payout — ${p.employeeName || p.employeeId || 'staff'}`, p.amount || 0));

    src.loans.forEach((l) => {
      loanRepayments(l)
        .filter((r) => r.date === d)
        .forEach((r) => debit(d, `Loan repayment${l.investorName ? ` to ${l.investorName}` : ''}`, r.amount));
    });

    cursor = addDays(cursor, 1);
  }

  return { anchorDate, anchorLabel, anchorBalance, lines, closingBalance: balance };
}
