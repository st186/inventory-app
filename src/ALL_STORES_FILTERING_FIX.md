# All Stores Filtering Fix

## Issue Description
When a Cluster Head selects "All Stores" and an Operational Manager selects a specific store (e.g., "Bunny Momos 1"), the Online Cash in Hand values were different, even when other stores had no data. 

### Example
- **Cluster Head (All Stores)**: ₹-94,656.68
- **Operational Manager (Bunny Momos 1)**: ₹3,883.32

Even though Bunny Momos 2 had no data, the values didn't match.

## Root Cause
The issue was caused by how the system handled online cash recalibrations and data filtering when "All Stores" was selected:

### 1. Recalibration Handling
- **Before the fix**: When `effectiveStoreId` was `null` or `'all'`, the `checkOnlineRecalibrationStatus()` function would return early and not set `lastOnlineRecalibration` to `null` explicitly
- **Problem**: This meant `lastOnlineRecalibration` could retain its previous value from a different store selection, or remain undefined, causing inconsistent behavior
- **Impact**: 
  - When viewing "All Stores": Calculation used `startDate = '2000-01-01'` (all history) and aggregated ALL data from ALL stores
  - When viewing specific store: Calculation used the store's recalibration date as `startDate`, only including data from that date onwards
  - This led to different time ranges and different calculated balances

### 2. Loan Data Loading
- **Before the fix**: When `effectiveStoreId` was `null` or `'all'`, the `loadOnlineLoans()` function would return early without loading any loans
- **Problem**: Loans weren't included in "All Stores" calculations
- **Impact**: Missing loan data in the online cash calculation for "All Stores" view

## Changes Made

### 1. `/components/SalesManagement.tsx` - Line ~176

**checkOnlineRecalibrationStatus() function**

```typescript
const checkOnlineRecalibrationStatus = async () => {
  const today = new Date();
  const currentDay = today.getDate();
  const currentMonthKey = today.toISOString().slice(0, 7);
  
  // For "All Stores" view, we don't use recalibration (aggregate from beginning)
  if (!effectiveStoreId || effectiveStoreId === 'all') {
    setLastOnlineRecalibration(null);
    setNeedsOnlineRecalibration(false);
    return;
  }
  
  if (!context.user?.accessToken) return;
  
  // ... rest of the function continues as before
}
```

**Changes**:
- Added explicit check for "All Stores" view at the beginning
- Explicitly sets `lastOnlineRecalibration` to `null`
- Disables recalibration prompts for "All Stores" view
- Returns early to skip individual store recalibration logic

**Effect**:
- "All Stores" view consistently calculates from the beginning of time (`startDate = '2000-01-01'`)
- Individual store views use their specific recalibration dates
- No confusion from stale recalibration data

### 2. `/components/SalesManagement.tsx` - Line ~143

**loadOnlineLoans() function**

```typescript
const loadOnlineLoans = async () => {
  if (!context.user?.accessToken) return;
  
  setIsLoadingLoans(true);
  try {
    // For "All Stores" view, pass undefined to get all loans
    const storeIdParam = (!effectiveStoreId || effectiveStoreId === 'all') ? undefined : effectiveStoreId;
    const loans = await api.getOnlineLoans(context.user.accessToken, storeIdParam);
    setOnlineLoans(loans);
  } catch (error) {
    console.error('Error loading online loans:', error);
  } finally {
    setIsLoadingLoans(false);
  }
};
```

**Changes**:
- Removed early return when `effectiveStoreId` is not set
- Added logic to pass `undefined` to API when viewing "All Stores"
- Backend API already supports this - returns all loans when storeId is undefined

**Effect**:
- "All Stores" view now includes loans from all stores in calculations
- Individual store views show only that store's loans

### 3. Enhanced Console Logging

Added more detailed logging to the online cash calculation:

```typescript
console.log('📊 ONLINE CASH BALANCE CALCULATION:', {
  effectiveStoreId,           // NEW: Shows which store is being calculated
  selectedDate,
  selectedMonth,
  hasRecalibration: hasRecalibrationThisMonth,
  recalibrationDate: hasRecalibrationThisMonth ? lastOnlineRecalibration.date : 'none',
  startingBalance,
  startDate,
  totalSalesRecords: context.salesData.length,          // NEW: Total records
  filteredSalesRecords: storeFilteredSales.length,      // NEW: Filtered records
  totalInventoryRecords: context.inventory.length,      // NEW: Total records
  filteredInventoryRecords: storeFilteredInventory.length  // NEW: Filtered records
});
```

**Effect**:
- Easier debugging of filtering issues
- Can verify that "All Stores" shows all records while specific stores show filtered records

## Expected Behavior After Fix

### All Stores View
1. **Recalibration**: Always `null` (calculates from beginning of time)
2. **Start Date**: Always `'2000-01-01'`
3. **Data Filtering**: Aggregates all data from all stores
4. **Loans**: Includes all loans from all stores
5. **Payouts**: Includes all payouts from all stores
6. **Employee Payouts**: Includes all employee payouts from all stores

### Individual Store View
1. **Recalibration**: Uses store-specific recalibration (if exists)
2. **Start Date**: Recalibration date (if exists) or `'2000-01-01'`
3. **Data Filtering**: Only that store's data
4. **Loans**: Only that store's loans
5. **Payouts**: Only that store's payouts (filtered in calculation)
6. **Employee Payouts**: Only that store's employee payouts (filtered in calculation)

## Consistency Check

When **only one store has data** (e.g., Bunny Momos 1), the calculations should now be:

### All Stores (without recalibration)
- Calculates from `'2000-01-01'` to selected date
- Includes all data from Bunny Momos 1
- Result: Sum of all historical transactions for Bunny Momos 1

### Bunny Momos 1 (without recalibration)
- Calculates from `'2000-01-01'` to selected date
- Includes all data from Bunny Momos 1
- Result: Sum of all historical transactions for Bunny Momos 1

**These should now be EQUAL** ✅

### Bunny Momos 1 (with recalibration)
- Calculates from recalibration date to selected date
- Uses recalibration starting balance
- Result: Starting balance + transactions since recalibration

**This will be DIFFERENT from All Stores** - and that's expected because:
- All Stores doesn't use recalibration
- Individual store uses its recalibration to reset the baseline

## Future Improvements

### Option 1: Per-Store Calculation (More Accurate)
Calculate each store independently using its own recalibration, then sum:
```typescript
const calculateAllStoresOnlineCash = () => {
  let totalOnlineCash = 0;
  for (const store of stores) {
    totalOnlineCash += calculateStoreOnlineCash(store.id);
  }
  return totalOnlineCash;
};
```

**Pros**: Most accurate
**Cons**: More complex, requires restructuring calculation logic

### Option 2: Aggregate Recalibration
Allow creating an "All Stores" recalibration entry that sets a baseline for the aggregated view.

**Pros**: Allows resetting baseline for "All Stores" view
**Cons**: Adds complexity, need to handle partial recalibrations

### Option 3: Show Warning
Display a warning when viewing "All Stores" that the calculation doesn't use store-specific recalibrations.

**Pros**: Simple, informs users of limitation
**Cons**: Doesn't solve the accuracy issue

## Testing Checklist

- [ ] Select "All Stores" as Cluster Head
  - [ ] Verify `lastOnlineRecalibration` is `null` in console
  - [ ] Verify loans are loaded
  - [ ] Verify calculation starts from `'2000-01-01'`
  
- [ ] Select specific store (e.g., "Bunny Momos 1")
  - [ ] Verify `lastOnlineRecalibration` is loaded for that store
  - [ ] Verify only that store's loans are loaded
  - [ ] Verify calculation uses recalibration date (if exists)
  
- [ ] When only one store has data
  - [ ] "All Stores" and that specific store should show same value (if no recalibration)
  - [ ] "All Stores" and that specific store may differ (if recalibration exists for that store)
  
- [ ] Console logging
  - [ ] Verify `effectiveStoreId` is logged correctly
  - [ ] Verify filtered record counts match expectations

## Related Files
- `/components/SalesManagement.tsx` - Main changes
- `/utils/api.ts` - API functions (no changes needed)
- `/supabase/functions/server/index.tsx` - Backend endpoints (no changes needed)

## Date Fixed
February 4, 2026
