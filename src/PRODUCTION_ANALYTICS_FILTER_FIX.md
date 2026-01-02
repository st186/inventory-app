# Production Analytics Filter Fix - December 30, 2024

## Issue
When selecting a production house in Production Analytics mode, the data was showing 0 production and 0 wastage despite production data existing in the system.

## Root Cause
The `selectedProductionHouseId` state was being initialized incorrectly for production incharges:

**Before (Line 205-207):**
```typescript
const [selectedProductionHouseId, setSelectedProductionHouseId] = useState<string | null>(
  isProductionIncharge ? effectiveStoreId : null
);
```

The problem: `effectiveStoreId` is calculated as `null` when `analyticsMode === 'production'`, so production incharges would get `null` as their initial production house ID instead of their actual production house.

## Fix Applied

**After (Line 205-207):**
```typescript
const [selectedProductionHouseId, setSelectedProductionHouseId] = useState<string | null>(
  isProductionIncharge ? (context.user?.storeId || null) : null
);
```

Now production incharges get their actual production house ID from `context.user?.storeId` directly.

## Debug Logging Added

To help trace filtering issues, comprehensive debug logging has been added in the following locations:

### 1. Component Level (Lines 216-229)
- Total production records count
- Detailed production data with IDs and totals
- Selected production house ID
- Analytics mode
- User information (storeId, designation, role)
- Available production houses

### 2. Production Summary Cards (Lines 2252-2265)
- Analytics mode
- Selected production house ID
- Effective store ID
- Filter ID being used
- Total and filtered production record counts
- Records that were filtered out

### 3. Production House Stock Status (Lines 2382-2394)
- Analytics mode
- Selected production house ID
- Selected store ID
- User store ID
- Effective production house ID
- Filtered production count

## Expected Behavior After Fix

### For Cluster Heads in Production Analytics Mode
1. Select "Production Analytics" button
2. See production house selector at the top
3. Select a specific production house (e.g., "Production House BWN")
4. **Should see:** Actual production and wastage data for that production house
5. **Console logs:** Check the filter ID matches the selected production house ID

### For Production Incharges in Production Analytics Mode
1. Automatically see their production house pre-selected
2. See their production and wastage data
3. Cannot change to other production houses (selector hidden)

## Debugging Steps

If data still shows as 0:

1. **Open Browser Console** (F12)

2. **Check Production Data Debug Logs:**
   ```
   📊 Analytics - Production Data Debug:
   ```
   - Verify `productionData` has records
   - Check if records have `productionHouseId` or `storeId` fields
   - Note the IDs present in the data

3. **Check Filter Logs:**
   ```
   🏭 Production Summary Cards Filter Debug:
   ```
   - Verify `filterById` matches your selected production house ID
   - Check `filteredProduction` count is > 0
   - Look for "Filtered out record" messages to see why records are excluded

4. **Verify Production House IDs:**
   - Check "Available production houses" in the logs
   - Ensure selected production house ID exists in the data
   - Verify production data records use the same ID format

## Common Issues & Solutions

### Issue: Production data has `storeId` but not `productionHouseId`
**Solution:** The code handles this with fallback:
```typescript
const phId = p.productionHouseId || p.storeId; // Fallback for old data
```

### Issue: IDs don't match between selection and data
**Solution:** Check console logs for ID format differences. Production house IDs should be consistent across:
- `context.productionHouses[].id`
- `productionData[].productionHouseId` or `productionData[].storeId`
- `selectedProductionHouseId`

### Issue: Time filter is too restrictive
**Solution:** Try setting time filter to "All Time" or a wider date range to see if data appears.

## Files Modified
- `/components/Analytics.tsx` (Lines 205-207, 216-229, 2252-2265, 2382-2394)

## Related Issues Fixed Previously
- Store Analytics filtering for cluster heads (December 30, 2024)
- Daily Ingredient Usage & SOP Compliance filtering (December 30, 2024)

## Testing Checklist
- [ ] Cluster head can select any production house in Production Analytics
- [ ] Data shows correctly for selected production house
- [ ] Production incharge sees their production house pre-selected
- [ ] Total Production card shows correct count
- [ ] Total Wastage card shows correct count
- [ ] Production charts show correct data
- [ ] Console logs show correct filtering logic
