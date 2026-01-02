# ✅ Quick Completion Checklist

Follow these steps in order to complete the multi-store integration:

---

## 📋 STEP-BY-STEP CHECKLIST

### ✅ STEP 1: Update Type Definitions (3 places)
**File:** `/App.tsx` (Lines 26-67)

Add `storeId?: string | null;` to:
- [ ] `InventoryItem` type (after `totalCost: number;`)
- [ ] `OverheadItem` type (after `amount: number;`)
- [ ] `SalesData` type (after `rejectionReason: string | null;`)

---

### ✅ STEP 2: Update InventoryContextType
**File:** `/App.tsx` (Line ~86)

Add these 3 lines before closing brace:
```typescript
stores: api.Store[];
selectedStoreId: string | null;
onStoreChange: (storeId: string | null) => void;
```

---

### ✅ STEP 3: Update loadData Function
**File:** `/App.tsx` (Line ~113)

**Change signature to:**
```typescript
const loadData = async (accessToken: string, userRole?: string, userStoreId?: string | null) => {
```

**Change Promise.all to include stores:**
```typescript
const [inventoryData, overheadsData, salesDataResults, storesData] = await Promise.all([
  api.fetchInventory(accessToken),
  api.fetchOverheads(accessToken),
  api.fetchSalesData(accessToken),
  api.getStores()  // ADD THIS
]);
```

**Add after setSalesData:**
```typescript
setStores(storesData);

// Auto-select manager's store
if (userRole === 'manager' && userStoreId) {
  setSelectedStoreId(userStoreId);
}
```

---

### ✅ STEP 4: Update checkSession useEffect
**File:** `/App.tsx` (Line ~150)

**Add to userData:**
```typescript
storeId: session.user.user_metadata?.storeId || null,
```

**Update loadData call:**
```typescript
await loadData(session.access_token, userData.role, userData.storeId);
```

---

### ✅ STEP 5: Update handleLogin
**File:** `/App.tsx` (Line ~189)

**Add to userData:**
```typescript
storeId: data.user.user_metadata?.storeId || null,
```

**Update loadData call:**
```typescript
await loadData(data.session.access_token, userData.role, userData.storeId);
```

---

### ✅ STEP 6: Update handleLogout
**File:** `/App.tsx` (Line ~233)

**Add these two lines:**
```typescript
setStores([]);
setSelectedStoreId(null);
```

---

### ✅ STEP 7: Update contextValue
**File:** `/App.tsx` (Line ~312)

**ADD BEFORE contextValue:**
```typescript
// Filter data by selected store for cluster heads
const filteredInventory = user?.role === 'cluster_head' && selectedStoreId 
  ? inventory.filter(i => i.storeId === selectedStoreId)
  : inventory;
  
const filteredOverheads = user?.role === 'cluster_head' && selectedStoreId 
  ? overheads.filter(o => o.storeId === selectedStoreId)
  : overheads;
  
const filteredSalesData = user?.role === 'cluster_head' && selectedStoreId 
  ? salesData.filter(s => s.storeId === selectedStoreId)
  : salesData;
```

**CHANGE contextValue to use filtered data:**
```typescript
const contextValue: InventoryContextType = {
  inventory: filteredInventory,     // CHANGED
  overheads: filteredOverheads,     // CHANGED
  salesData: filteredSalesData,     // CHANGED
  // ... existing functions ...
  user,
  stores,                           // ADD
  selectedStoreId,                  // ADD
  onStoreChange: setSelectedStoreId // ADD
};
```

---

### ✅ STEP 8: Add Store Selector UI
**File:** `/App.tsx` (After `</nav>`, before Data Error Banner)

**ADD THIS SECTION:**
```typescript
{/* Store Selector for Cluster Heads */}
{isClusterHead && stores.length > 0 && (
  <div className="bg-white border-b border-gray-200 px-4 py-3">
    <div className="max-w-7xl mx-auto">
      <StoreSelector
        stores={stores}
        selectedStoreId={selectedStoreId}
        onStoreChange={setSelectedStoreId}
        showAllStores={true}
      />
    </div>
  </div>
)}
```

---

### ✅ STEP 9: Add Stores Button (Desktop - Cluster Head)
**File:** `/App.tsx` (After Employees button, cluster head section)

**FIND:**
```typescript
<UserPlus className="w-4 h-4" />
<span className="hidden xl:inline">Employees</span>
</button>
</>  // ← ADD NEW BUTTON BEFORE THIS
```

**ADD BEFORE `</>`:**
```typescript
<button
  onClick={() => setActiveView('stores')}
  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
    activeView === 'stores'
      ? 'bg-[#FFE4B5] text-gray-800 border-2 border-[#DEB887]'
      : 'bg-gray-50 text-gray-700 hover:bg-[#FFF8DC] border-2 border-transparent'
  }`}
>
  <Package className="w-4 h-4" />
  <span className="hidden xl:inline">Stores</span>
</button>
```

---

### ✅ STEP 10: Add Stores Button (Mobile - Cluster Head)
**File:** `/App.tsx` (After Employees button, mobile menu cluster head section)

**FIND:**
```typescript
<UserPlus className="w-5 h-5" />
<span>Employees</span>
</button>
</>  // ← ADD NEW BUTTON BEFORE THIS
```

**ADD BEFORE `</>`:**
```typescript
<button
  onClick={() => {
    setActiveView('stores');
    setIsMobileMenuOpen(false);
  }}
  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
    activeView === 'stores'
      ? 'bg-[#FFE4B5] text-gray-800'
      : 'bg-gray-50 text-gray-700 hover:bg-[#FFF8DC]'
  }`}
>
  <Package className="w-5 h-5" />
  <span>Stores</span>
</button>
```

---

### ✅ STEP 11: Add Stores View Routing
**File:** `/App.tsx` (In main content section)

**FIND:**
```typescript
) : activeView === 'employees' ? (
  <EmployeeManagement user={{...}} />
) : (  // ← ADD NEW CONDITION BEFORE THIS
  <ClusterDashboard context={contextValue} />
)
```

**ADD BEFORE final `:`:**
```typescript
) : activeView === 'stores' ? (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
    <StoreManagement onStoreCreated={async () => {
      if (user) {
        const storesData = await api.getStores();
        setStores(storesData);
      }
    }} />
  </div>
```

---

## 🎯 VERIFICATION

After completing all steps, verify:

- [ ] No TypeScript errors in App.tsx
- [ ] App compiles successfully
- [ ] Can login as cluster head
- [ ] "Stores" button appears in nav
- [ ] Can create a new store
- [ ] Store selector appears after creating store
- [ ] Can switch between stores
- [ ] Data filters correctly

---

## 🚨 COMMON ISSUES

**Issue:** TypeScript errors about storeId
**Fix:** Ensure all 3 type definitions have `storeId?: string | null;`

**Issue:** Store selector doesn't appear
**Fix:** Create at least one store first, then refresh

**Issue:** Cannot see Stores button
**Fix:** Login as cluster head, not manager

**Issue:** Data not filtering
**Fix:** Check filtered variables in contextValue

---

## ⏱️ TIME ESTIMATE

- Steps 1-7: ~5 minutes (code updates)
- Steps 8-11: ~5 minutes (UI additions)
- Testing: ~5 minutes
- **Total: ~15 minutes**

---

## 📞 NEED HELP?

Refer to detailed guides:
- `/MULTI_STORE_INTEGRATION_GUIDE.md` - Full technical details
- `/APPLY_REMAINING_CHANGES.md` - Code with context
- `/MULTI_STORE_COMPLETE_SUMMARY.md` - Overview

**Good luck! You're almost done! 🚀**
