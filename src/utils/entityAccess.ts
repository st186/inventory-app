// Resolves which store(s)/production house(s) a logged-in user has access to.
//
// Historically almost every screen computed "the current user's store" as
// `selectedStoreId || context.user?.storeId`, treating storeId as if it always held a
// real store's id. It doesn't: for a production incharge, storeId actually holds their
// production house's id (a legacy ambiguity, since one employee record was only ever
// designed to belong to one place). That mismatch broke the cash top-up store picker,
// Sales overview, Store Stock Status, and more over the course of one session - each
// fixed one at a time with an ad-hoc `isProductionIncharge ? ... : ...` branch.
//
// assignedStoreIds/assignedProductionHouseIds (added alongside this file) are the real,
// unambiguous fix: explicit arrays an employee can be assigned to, independent of what
// their designation implies. These helpers read that data first and only fall back to
// the old single-field guess for employees who haven't been migrated to the new fields
// yet (assignedStoreIds/assignedProductionHouseIds empty).

type UserLike = {
  storeId?: string | null;
  designation?: string | null;
  assignedStoreIds?: string[];
  assignedProductionHouseIds?: string[];
} | null | undefined;

type StoreLike = { id: string; productionHouseId?: string | null };

/**
 * The store id this user should default to when no store has been explicitly selected
 * in the UI (e.g. via a StoreSelector). Prefers the new assignedStoreIds array; falls
 * back to storeId only when it actually matches a real store (guards against a
 * production incharge's storeId, which holds a production house id instead).
 */
export function getDefaultStoreId(user: UserLike, stores: StoreLike[]): string | null {
  if (!user) return null;
  const assigned = getAssignedStoreIds(user, stores);
  return assigned.length > 0 ? assigned[0] : null;
}

/**
 * All store ids this user is assigned to (for a picker/dropdown, or "which stores can
 * this production incharge credit" style checks). Falls back to deriving it from
 * assignedProductionHouseIds (every store that production house supplies) or the
 * legacy storeId-as-production-house-id guess, for employees not yet migrated.
 */
export function getAssignedStoreIds(user: UserLike, stores: StoreLike[]): string[] {
  if (!user) return [];
  if (user.assignedStoreIds && user.assignedStoreIds.length > 0) {
    return user.assignedStoreIds;
  }
  if (user.storeId && stores.some((s) => s.id === user.storeId)) {
    return [user.storeId];
  }
  const phIds = getAssignedProductionHouseIds(user, []);
  if (phIds.length > 0) {
    return stores.filter((s) => s.productionHouseId && phIds.includes(s.productionHouseId)).map((s) => s.id);
  }
  return [];
}

/**
 * All production house ids this user is assigned to. Falls back to treating storeId as
 * a production house id (the legacy behavior) only when assignedProductionHouseIds is
 * empty, for employees not yet migrated to the new fields.
 */
export function getAssignedProductionHouseIds(user: UserLike, productionHouses: { id: string }[]): string[] {
  if (!user) return [];
  if (user.assignedProductionHouseIds && user.assignedProductionHouseIds.length > 0) {
    return user.assignedProductionHouseIds;
  }
  if (user.designation === 'production_incharge' && user.storeId) {
    if (productionHouses.length === 0 || productionHouses.some((ph) => ph.id === user.storeId)) {
      return [user.storeId];
    }
  }
  return [];
}

/**
 * The one production house a production incharge's entries, ledger and wastage notes belong
 * to. assignedProductionHouseIds wins; then storeId - mapped through the store's own
 * productionHouseId when it holds a store's id. Team → Change store (stores only) once set a
 * production incharge's storeId to the store their kitchen supplies, and for two weeks their
 * production was filed under that store, so the production log showed those days as missing.
 */
export function productionInchargeHouseId(user: UserLike, stores: StoreLike[]): string | null {
  if (!user) return null;
  if (user.assignedProductionHouseIds && user.assignedProductionHouseIds.length > 0) {
    return user.assignedProductionHouseIds[0];
  }
  if (!user.storeId) return null;
  return stores.find((s) => s.id === user.storeId)?.productionHouseId || user.storeId;
}

/**
 * The effective store id for the current view: an explicitly selected store wins,
 * otherwise fall back to the user's default assigned store.
 */
export function getEffectiveStoreId(
  selectedStoreId: string | null | undefined,
  user: UserLike,
  stores: StoreLike[]
): string | null {
  return selectedStoreId || getDefaultStoreId(user, stores);
}

type EmployeeLike = { storeId?: string | null };

/**
 * Whether an employee record belongs to the given store, for a "filter this list down to
 * one store" screen (Employee Management, Approve Timesheets/Leaves, Analytics' employee-
 * and payout-derived cost figures, etc.). Three ways this can be true, all confirmed real
 * this session:
 *  1. `emp.storeId` is that store's own id - the normal case.
 *  2. `emp.storeId` is null/undefined - a legacy/unassigned record, historically always
 *     included rather than silently dropped from every store's view.
 *  3. `emp.storeId` is that store's LINKED PRODUCTION HOUSE's id - a production incharge/
 *     ops employee's `storeId` field holds their production house's id, not a real store
 *     id (see the file header). Missing this case is what caused this store's own
 *     production staff (e.g. its production incharge) to silently vanish from that
 *     store's employee/payout/salary-cost figures the moment a specific store was
 *     selected, while "All Stores" (which applies no filter at all) never dropped them -
 *     the same store vs. "All Stores" inconsistency bug, now fixed at its one source
 *     instead of separately in every screen that filters employees by store.
 */
export function employeeBelongsToStore(emp: EmployeeLike, storeId: string, stores: StoreLike[]): boolean {
  if (!emp.storeId) return true;
  if (emp.storeId === storeId) return true;
  const linkedProductionHouseId = stores.find((s) => s.id === storeId)?.productionHouseId;
  return !!linkedProductionHouseId && emp.storeId === linkedProductionHouseId;
}
