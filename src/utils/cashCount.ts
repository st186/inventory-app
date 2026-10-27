// Whether a day's sales record holds a cash count a person actually saved.
//
// The POS sync creates each day's record at night with actualCashInHand: 0 and createdBy
// 'pos-sync' (and a cash top-up approval can create the same placeholder), so a 0 there is
// "nobody has counted yet", not "the till was empty". The store incharge's save replaces
// createdBy with their own id and sets an approval status.

type SaleLike = {
  createdBy?: string | null;
  actualCashInHand?: number | null;
  approvalStatus?: string | null;
  updatedBy?: string | null;
  approvalRequired?: boolean;
  approvedBy?: string | null;
  approvalRequested?: boolean;
  rejectedBy?: string | null;
};

const PLACEHOLDER_CREATORS = new Set(['pos-sync', 'cash-topup-approval']);

export const isPlaceholderSale = (s: SaleLike | null | undefined) =>
  !s || !s.createdBy || PLACEHOLDER_CREATORS.has(s.createdBy);

export const hasRealCashCount = (s: SaleLike | null | undefined): boolean =>
  !!s && !isPlaceholderSale(s) && typeof s.actualCashInHand === 'number' && (!!s.approvalStatus || !!s.updatedBy);

// Plain-words status for a day's sales record (exports and the audit view). approvalRequired
// alone can't tell an approved day from one nobody saved - the POS placeholder has it false.
export function salesDayStatus(s: SaleLike | null | undefined): string {
  if (!s) return 'No record';
  if (isPlaceholderSale(s)) return 'Not saved by the store yet (POS figures only)';
  if (s.rejectedBy) return 'Rejected';
  if (s.approvalStatus === 'pending') return s.approvalRequested ? 'Waiting for approval (requested)' : 'Waiting for approval';
  // A save that needed no sign-off is stamped approved by the person who saved it.
  if (s.approvalStatus === 'approved') return s.approvedBy && s.approvedBy !== s.createdBy && s.approvedBy !== 'self' ? 'Approved' : 'Saved, no approval needed';
  return 'Saved';
}
