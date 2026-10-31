// What moves a store's Online Cash (Paytm/UPI) balance, and on which day. One copy of these
// rules serves both the app (src/utils/paytmBalance.ts: the store incharge's form, the Sales
// overview card and the Paytm statement) and the server's cascadeRecomputePaytmBalances
// (index.ts), which rewrites every saved day's actualPaytmBalance after each Paytm-affecting
// save. The two used to keep separate formulas - the server ignored loans and took bank- and
// cash-paid salaries off Paytm - so the stored figure and the on-screen one disagreed and
// whichever saved last won.
//
// Mirrored byte-for-byte at supabase/functions/make-server-c2dd9b9d/paytmRules.ts (the edge
// function can't import from src/): keep both copies identical. No imports, so the file runs
// unchanged in the browser and in Deno.

type Row = Record<string, any>;

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

// ── Which saved figures are real ──

// The nightly POS sync and a cash top-up approval both create the day's sales row before
// anyone has counted anything. Older ones stored 0 in actualCashInHand/actualPaytmBalance to
// mean "not counted"; newer ones store null. A row stops being a placeholder once a person
// saves it from the sales form: the server stamps updatedBy, and older saves replaced
// createdBy instead.
const PLACEHOLDER_CREATORS = ['pos-sync', 'cash-topup-approval'];

export const isPlaceholderSale = (s: Row | null | undefined): boolean =>
  !!s && !s.updatedBy && PLACEHOLDER_CREATORS.includes(s.createdBy);

// null when nobody has a real figure for the day. A 0 on a placeholder row is the old
// "not counted" marker, not a count of zero.
const realFigure = (s: Row, value: unknown): number | null =>
  typeof value !== 'number' || (value === 0 && isPlaceholderSale(s)) ? null : value;

// The store's physically counted cash for the day, or null when it hasn't been counted.
export const countedCashInHand = (s: Row | null | undefined): number | null =>
  s ? realFigure(s, s.actualCashInHand) : null;

// The day's saved closing Paytm balance, or null when none has been worked out for it yet.
export const knownPaytmBalance = (s: Row | null | undefined): number | null =>
  s ? realFigure(s, s.actualPaytmBalance) : null;

// ── Times ──

// When a recalibration's count was logged (always saved as real UTC).
const recalCountedAtMs = (r: Row): number | null => {
  const ms = Date.parse(r?.createdAt || r?.timestamp || '');
  return Number.isNaN(ms) ? null : ms;
};

// When a cash top-up was approved. Approvals saved before approvedAtIsUtc existed hold IST
// wall-clock time with a 'Z' suffix - 5h30 ahead of the real moment - so those are moved back
// by 5h30. Approvals carrying approvedAtIsUtc: true are real UTC.
export const topupApprovedAtMs = (t: Row): number | null => {
  const ms = Date.parse(t?.approvedAt || '');
  if (Number.isNaN(ms)) return null;
  return t.approvedAtIsUtc ? ms : ms - IST_OFFSET_MS;
};

// A same-day top-up approved after a recalibration's count isn't inside the counted figure.
// Without a time on either side there's nothing to compare, so the count is taken as final.
export const approvedAfterCount = (t: Row, recal: Row): boolean => {
  const counted = recalCountedAtMs(recal);
  const approved = topupApprovedAtMs(t);
  return counted !== null && approved !== null && approved > counted;
};

// ── What moves the balance ──

// Aggregator commission is stored as an overhead ('service_charge' with this description, or
// the old 'commission' category). It never moves Paytm: Swiggy/Zomato deduct it before paying
// out, and the settlement's net payout is what arrives (owner, 27 Oct 2026).
export const isCommissionEntry = (item: Row): boolean =>
  (item?.category === 'service_charge' && typeof item?.description === 'string' && item.description.includes('Aggregator Commission')) ||
  item?.category === 'commission';

// A salary/payout leaves Paytm unless it was paid from the bank or cash. A missing paidFrom is
// a record from before the field existed, when every payout came out of Paytm.
export const payoutHitsPaytm = (p: Row): boolean => p?.paidFrom == null || p.paidFrom === 'paytm';

// An approved loan adds its amount on its loanDate; a pending or rejected one never arrived.
export const loanCountsTowardPaytm = (l: Row): boolean => l?.status === 'active' || l?.status === 'repaid';

// ── Event stalls (events.ts / eventRules.ts) ──
// A stall set to "same as the store's Paytm" collects into its parent store's Paytm: GET /sales
// (and the server's cascade) put that day's stall collections on the store's own row as
// eventPaytmIn, counted here like the store's own Paytm takings. A stall with its own account
// never appears here.
const eventPaytmIn = (s: Row): number => (typeof s?.eventPaytmIn === 'number' ? s.eventPaytmIn : 0);
// An event's cash top-up (reason 'event_cash') drains Paytm only when the approver funded it from
// the store's Paytm (fundingSource 'store_paytm', with paytmStoreId naming that store); one
// funded from the production house's cash leaves Paytm alone.
export const topupDrainsPaytm = (t: Row): boolean => t?.reason !== 'event_cash' || t?.fundingSource === 'store_paytm';
const isEventPaytmTopup = (t: Row): boolean => t?.reason === 'event_cash' && t?.fundingSource === 'store_paytm';

// Every repayment of a loan, each on its own date. Repayments made since `repayments` was added
// are listed one by one. Older loans only kept a running repaidAmount plus, once fully repaid,
// the final repaymentDate - the whole amount goes on that date. An older loan that was only
// partly repaid has no date to put the money on, so it can't move Paytm until the next
// repayment records it (see PUT /online-loans/:id/repay).
export function loanRepayments(l: Row): { date: string; amount: number }[] {
  if (Array.isArray(l?.repayments)) {
    return l.repayments
      .filter((r: Row) => typeof r?.date === 'string')
      .map((r: Row) => ({ date: r.date, amount: r.amount || 0 }));
  }
  if (l?.status === 'repaid' && typeof l.repaymentDate === 'string' && (l.repaidAmount || 0) > 0) {
    return [{ date: l.repaymentDate, amount: l.repaidAmount }];
  }
  return [];
}

export interface PaytmSources {
  sales: Row[];          // sales: rows (paytmAmount in, usedOnlineMoney out)
  settlements: Row[];    // aggregator-settlement: rows, by settlementDate
  payouts: Row[];        // payout: rows (salaries)
  topups: Row[];         // cash-topup: requests
  loans: Row[];          // online-loan: rows
  overheads: Row[];      // kept for callers; commission no longer moves Paytm
  recalibrations: Row[]; // online-cash-recalibration: rows (physical counts)
  // Hand-typed Swiggy/Zomato payouts (online_payout:) from before settlement uploads replaced
  // them. Nothing new is written there; only the store incharge's form still passes them.
  legacyPayouts?: Row[];
}

// Narrows every list to one store. A payout without a storeId predates per-store payouts and
// has always counted against every store. No storeId = every store together.
export function paytmSourcesForStore(src: PaytmSources, storeId: string | null | undefined): PaytmSources {
  if (!storeId) return src;
  const own = (r: Row) => r?.storeId === storeId;
  return {
    sales: src.sales.filter(own),
    settlements: src.settlements.filter(own),
    payouts: src.payouts.filter((p) => !p?.storeId || p.storeId === storeId),
    // An event top-up has no storeId; paytmStoreId names the store whose Paytm paid for it.
    topups: src.topups.filter((t) => own(t) || t?.paytmStoreId === storeId),
    loans: src.loans.filter(own),
    overheads: src.overheads.filter(own),
    recalibrations: src.recalibrations.filter(own),
    legacyPayouts: (src.legacyPayouts || []).filter(own),
  };
}

export interface PaytmMovement {
  paytmReceived: number;     // counter Paytm/UPI takings
  aggregatorPayouts: number; // uploaded Swiggy/Zomato settlements
  legacyPayouts: number;     // old hand-typed Swiggy/Zomato payouts
  loansReceived: number;
  usedOnlineMoney: number;   // cash top-ups into the store's till (stored on the day's sales row)
  productionTopups: number;  // cash top-ups handed to the production house instead
  commission: number;        // always 0: payouts arrive net of commission (kept for older callers)
  loanRepayments: number;
  salaryPayouts: number;     // salaries/payouts paid from Paytm
  eventPaytmReceived: number; // event stalls collecting into this store's Paytm (eventPaytmIn)
  eventTopups: number;       // event cash top-ups the approver funded from this Paytm
  net: number;
}

// The day the entry form is open on: its live, not-yet-saved figures replace that day's row.
export interface PaytmLiveDay {
  date: string;
  paytmReceived: number;
  usedOnlineMoney: number;
}

const sumOf = <T>(rows: T[], amount: (r: T) => number): number =>
  rows.reduce((total, r) => total + (amount(r) || 0), 0);

// Everything that moved the balance after `afterDate`, up to and including `throughDate`
// (YYYY-MM-DD; '' for "from the very beginning").
export function paytmMovement(src: PaytmSources, afterDate: string, throughDate: string, live?: PaytmLiveDay | null): PaytmMovement {
  const inRange = (d: unknown): boolean => typeof d === 'string' && d > afterDate && d <= throughDate;
  const liveDay = live && inRange(live.date) ? live : null;
  const sales = src.sales.filter((s) => inRange(s.date) && !(liveDay && s.date === liveDay.date));
  const repayments = src.loans.reduce((all: { date: string; amount: number }[], l) => all.concat(loanRepayments(l)), []);

  const paytmReceived = sumOf(sales, (s) => s.paytmAmount) + (liveDay ? liveDay.paytmReceived : 0);
  const aggregatorPayouts = sumOf(src.settlements.filter((s) => inRange(s.settlementDate)), (s) => s.netPayout);
  const legacyPayouts = sumOf((src.legacyPayouts || []).filter((p) => inRange(p.date)), (p) => (p.swiggyPayout || 0) + (p.zomatoPayout || 0));
  const loansReceived = sumOf(src.loans.filter((l) => loanCountsTowardPaytm(l) && inRange(l.loanDate)), (l) => l.loanAmount);
  const usedOnlineMoney = sumOf(sales, (s) => s.usedOnlineMoney) + (liveDay ? liveDay.usedOnlineMoney : 0);
  // Store-reason top-ups are already in usedOnlineMoney; production-reason ones never go on a
  // sales row (they mustn't add to the store's own cash), but they drain the same Paytm.
  const productionTopups = sumOf(src.topups.filter((t) => t.status === 'approved' && t.reason === 'production_inventory' && inRange(t.date)), (t) => t.requestedAmount);
  const commission = 0;
  const loanRepaid = sumOf(repayments.filter((r) => inRange(r.date)), (r) => r.amount);
  const salaryPayouts = sumOf(src.payouts.filter((p) => payoutHitsPaytm(p) && inRange(p.date)), (p) => p.amount);
  // The live day's saved row still carries the stalls' collections: the form only replaces the
  // store's own Paytm takings and top-ups.
  const eventPaytmReceived = sumOf(src.sales.filter((s) => inRange(s.date)), eventPaytmIn);
  const eventTopups = sumOf(src.topups.filter((t) => t.status === 'approved' && isEventPaytmTopup(t) && inRange(t.date)), (t) => t.requestedAmount);

  return {
    paytmReceived, aggregatorPayouts, legacyPayouts, loansReceived, usedOnlineMoney, productionTopups, commission,
    loanRepayments: loanRepaid, salaryPayouts, eventPaytmReceived, eventTopups,
    net: paytmReceived + aggregatorPayouts + legacyPayouts + loansReceived + eventPaytmReceived
      - usedOnlineMoney - productionTopups - loanRepaid - salaryPayouts - eventTopups,
  };
}

const usableRecal = (r: Row): boolean => typeof r?.date === 'string' && typeof r?.actualBalance === 'number';

// The store's recalibration (physical count) on `date`, if one was logged.
export const recalibrationOn = (src: PaytmSources, date: string): Row | null =>
  src.recalibrations.find((r) => usableRecal(r) && r.date === date) || null;

// The balance at the end of a recalibration day: the counted figure plus what moved after the
// count. A count is a point in time, often taken early, and the day's own Paytm takings,
// aggregator payouts and Paytm-paid salaries have no time to compare it against, so they're
// added in full. Cash top-ups do have one: only those approved after the count still come off.
// The day's loans and repayments are taken to be inside the count.
// Settlements go strictly by settlementDate (the real bank-credit date per the aggregator's
// UTR), never by when the file was uploaded: one dated before the recalibration is already in
// the count however late its file arrives (confirmed with the owner).
export function recalDayEndBalance(src: PaytmSources, recal: Row, live?: PaytmLiveDay | null): number {
  const date = recal.date;
  const paytmReceived = live && live.date === date
    ? live.paytmReceived
    : sumOf(src.sales.filter((s) => s.date === date), (s) => s.paytmAmount);
  const aggregatorPayouts = sumOf(src.settlements.filter((s) => s.settlementDate === date), (s) => s.netPayout);
  const salaryPayouts = sumOf(src.payouts.filter((p) => payoutHitsPaytm(p) && p.date === date), (p) => p.amount);
  const lateTopups = sumOf(src.topups.filter((t) => t.status === 'approved' && topupDrainsPaytm(t) && t.date === date && approvedAfterCount(t, recal)), (t) => t.requestedAmount);
  // A count logged after the day was over (from 11 PM India time that day, or any time later)
  // already holds the day's takings, payouts and Paytm-paid salaries: nothing is added on top
  // (owner, 1 Nov 2026: 31 Oct's balance, logged at 1:58 AM, showed its own day's Paytm twice).
  if (countedAfterDay(recal)) return recal.actualBalance - lateTopups;
  // Stall collections have no time either, so like the store's own takings they're added in full.
  const eventPaytmReceived = sumOf(src.sales.filter((s) => s.date === date), eventPaytmIn);
  return recal.actualBalance + paytmReceived + aggregatorPayouts + eventPaytmReceived - salaryPayouts - lateTopups;
}

// The day is over by 11 PM India time (the last orders are in): a count logged then or later is the
// day's closing balance.
export const countedAfterDay = (recal: Row): boolean => {
  const counted = recalCountedAtMs(recal);
  return counted !== null && typeof recal?.date === 'string' && counted >= Date.parse(`${recal.date}T23:00:00+05:30`);
};

export interface PaytmAnchor {
  date: string;
  balance: number; // end-of-day balance on `date`
  source: 'recalibration' | 'saved-day';
}

// Where a running total for `date` starts: the latest of a recalibration and a day with a real
// saved balance, strictly before `date`. A recalibration wins a tie - it's the physically
// checked figure, and that day's saved balance is derived from it anyway.
export function paytmAnchorBefore(src: PaytmSources, date: string): PaytmAnchor | null {
  let anchor: PaytmAnchor | null = null;
  for (const s of src.sales) {
    const balance = knownPaytmBalance(s);
    if (balance === null || typeof s.date !== 'string' || s.date >= date) continue;
    if (!anchor || s.date > anchor.date) anchor = { date: s.date, balance, source: 'saved-day' };
  }
  const recal = src.recalibrations
    .filter((r) => usableRecal(r) && r.date < date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (recal && (!anchor || recal.date >= anchor.date)) {
    anchor = { date: recal.date, balance: recalDayEndBalance(src, recal), source: 'recalibration' };
  }
  return anchor;
}

// The expected closing balance on `date`: a recalibration that day, else the latest anchor
// before it plus everything since, else everything ever recorded from zero.
export function expectedPaytmOn(src: PaytmSources, date: string, live?: PaytmLiveDay | null): { balance: number; anchor: PaytmAnchor | null; recalibration: Row | null } {
  const recalibration = recalibrationOn(src, date);
  if (recalibration) return { balance: recalDayEndBalance(src, recalibration, live), anchor: null, recalibration };
  const anchor = paytmAnchorBefore(src, date);
  const moved = paytmMovement(src, anchor ? anchor.date : '', date, live).net;
  return { balance: (anchor ? anchor.balance : 0) + moved, anchor, recalibration: null };
}
