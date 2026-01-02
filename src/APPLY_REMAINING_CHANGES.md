# Remaining Changes to Complete Multi-Store Integration

I've already applied some changes automatically. Here are the remaining changes needed:

---

## ✅ ALREADY APPLIED AUTOMATICALLY:
1. ✓ Added store state variables (`stores`, `selectedStoreId`)
2. ✓ Updated `activeView` type to include 'stores'
3. ✓ Updated `user` type to include `storeId`
4. ✓ Updated `InventoryContextType` type

---

## 🔧 REMAINING MANUAL CHANGES NEEDED:

### CHANGE 1: Update Types (Lines 26-67)

Add `storeId?: string | null;` to all three type definitions:

**InventoryItem** (add after line 34):
```typescript
  totalCost: number;
  storeId?: string | null;  // ADD THIS LINE
};
```

**OverheadItem** (add after line 43):
```typescript
  amount: number;
  storeId?: string | null;  // ADD THIS LINE
};
```

**SalesData** (add after line 66):
```typescript
  rejectionReason: string | null;
  storeId?: string | null;  // ADD THIS LINE
};
```

---

### CHANGE 2: Update InventoryContextType (add after line 86)

Add these three properties before the closing brace:
```typescript
  user: { email: string; name: string; role: string; employeeId: string | null; accessToken: string; storeId?: string | null } | null;
  stores: api.Store[];  // ADD THIS
  selectedStoreId: string | null;  // ADD THIS
  onStoreChange: (storeId: string | null) => void;  // ADD THIS
};
```

---

### CHANGE 3: Update loadData Function (Around line 113)

**FIND:**
```typescript
  const loadData = async (accessToken: string) => {
    setIsLoadingData(true);
    setDataError(null);
    try {
      const [inventoryData, overheadsData, salesData] = await Promise.all([
        api.fetchInventory(accessToken),
        api.fetchOverheads(accessToken),
        api.fetchSalesData(accessToken)
      ]);
      setInventory(inventoryData);
      setOverheads(overheadsData);
      setSalesData(salesData);
    } catch (error) {
      console.error('Error loading data:', error);
      setDataError('Failed to load inventory data. Please refresh the page.');
    } finally {\n      setIsLoadingData(false);
    }
  };
```

**REPLACE WITH:**
```typescript
  const loadData = async (accessToken: string, userRole?: string, userStoreId?: string | null) => {
    setIsLoadingData(true);
    setDataError(null);
    try {
      const [inventoryData, overheadsData, salesDataResults, storesData] = await Promise.all([
        api.fetchInventory(accessToken),
        api.fetchOverheads(accessToken),
        api.fetchSalesData(accessToken),
        api.getStores()
      ]);
      setInventory(inventoryData);
      setOverheads(overheadsData);
      setSalesData(salesDataResults);
      setStores(storesData);
      
      // Auto-select manager's store
      if (userRole === 'manager' && userStoreId) {
        setSelectedStoreId(userStoreId);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setDataError('Failed to load inventory data. Please refresh the page.');
    } finally {
      setIsLoadingData(false);
    }
  };
```

---

### CHANGE 4: Update checkSession (Around line 150)

**FIND:**
```typescript
          const userData = {
            email: session.user.email || '',
            name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
            role: session.user.user_metadata?.role || 'manager',
            employeeId: session.user.user_metadata?.employeeId || null,
            accessToken: session.access_token
          };
          setUser(userData);
          
          // Load data for the user
          await loadData(session.access_token);
```

**REPLACE WITH:**
```typescript
          const userData = {
            email: session.user.email || '',
            name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
            role: session.user.user_metadata?.role || 'manager',
            employeeId: session.user.user_metadata?.employeeId || null,
            storeId: session.user.user_metadata?.storeId || null,
            accessToken: session.access_token
          };
          setUser(userData);
          
          // Load data for the user
          await loadData(session.access_token, userData.role, userData.storeId);
```

---

### CHANGE 5: Update handleLogin (Around line 189)

**FIND:**
```typescript
        const userData = {
          email: data.user.email || '',
          name: data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'User',
          role: data.user.user_metadata?.role || 'manager',
          employeeId: data.user.user_metadata?.employeeId || null,
          accessToken: data.session.access_token
        };
        setUser(userData);
        
        // Load data for the user
        await loadData(data.session.access_token);
```

**REPLACE WITH:**
```typescript
        const userData = {
          email: data.user.email || '',
          name: data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'User',
          role: data.user.user_metadata?.role || 'manager',
          employeeId: data.user.user_metadata?.employeeId || null,
          storeId: data.user.user_metadata?.storeId || null,
          accessToken: data.session.access_token
        };
        setUser(userData);
        
        // Load data for the user
        await loadData(data.session.access_token, userData.role, userData.storeId);
```

---

### CHANGE 6: Update handleLogout (Around line 233)

**FIND:**
```typescript
  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    setUser(null);
    setInventory([]);
    setOverheads([]);
    setSalesData([]);
    setActiveView('sales');
  };
```

**REPLACE WITH:**
```typescript
  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    setUser(null);
    setInventory([]);
    setOverheads([]);
    setSalesData([]);
    setStores([]);
    setSelectedStoreId(null);
    setActiveView('sales');
  };
```

---

### CHANGE 7: Update contextValue (Around line 312)

**FIND:**
```typescript
  const contextValue: InventoryContextType = {
    inventory,
    overheads,
    salesData,
    addInventoryItem,
    addOverheadItem,
    updateInventoryItem,
    updateOverheadItem,
    deleteInventoryItem,
    deleteOverheadItem,
    addSalesData,
    updateSalesData,
    approveSalesData,
    requestSalesApproval,
    approveDiscrepancy,
    rejectDiscrepancy,
    isManager: user?.role === 'manager',
    user
  };
```

**REPLACE WITH:**
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

  const contextValue: InventoryContextType = {
    inventory: filteredInventory,
    overheads: filteredOverheads,
    salesData: filteredSalesData,
    addInventoryItem,
    addOverheadItem,
    updateInventoryItem,
    updateOverheadItem,
    deleteInventoryItem,
    deleteOverheadItem,
    addSalesData,
    updateSalesData,
    approveSalesData,
    requestSalesApproval,
    approveDiscrepancy,
    rejectDiscrepancy,
    isManager: user?.role === 'manager',
    user,
    stores,
    selectedStoreId,
    onStoreChange: setSelectedStoreId
  };
```

---

### CHANGE 8: Add Store Selector (After </nav> closing tag, BEFORE Data Error Banner)

**ADD THIS NEW SECTION:**
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

### CHANGE 9: Add Stores Button to Cluster Head Desktop Menu

**FIND in Desktop Menu (cluster head section, around line 535):**
```typescript
                  <button
                    onClick={() => setActiveView('employees')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      activeView === 'employees'
                        ? 'bg-[#E6E6FA] text-gray-800 border-2 border-[#D8BFD8]'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F8F8FF] border-2 border-transparent'
                    }`}
                  >\n                    <UserPlus className=\"w-4 h-4\" />
                    <span className=\"hidden xl:inline\">Employees</span>
                  </button>
                </>
```

**ADD THIS AFTER Employees button (before `</>`)**:
```typescript
                  <button
                    onClick={() => setActiveView('stores')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      activeView === 'stores'
                        ? 'bg-[#FFE4B5] text-gray-800 border-2 border-[#DEB887]'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#FFF8DC] border-2 border-transparent'
                    }`}
                  >\n                    <Package className=\"w-4 h-4\" />
                    <span className=\"hidden xl:inline\">Stores</span>
                  </button>
```

---

### CHANGE 10: Add Stores Button to Cluster Head Mobile Menu

**FIND in Mobile Menu (cluster head section, around line 640):**
```typescript
                  <button
                    onClick={() => {
                      setActiveView('employees');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'employees'
                        ? 'bg-[#E6E6FA] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F8F8FF]'
                    }`}
                  >
                    <UserPlus className=\"w-5 h-5\" />
                    <span>Employees</span>
                  </button>
                </>
```

**ADD THIS AFTER Employees button (before `</>`)**:
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
                    <Package className=\"w-5 h-5\" />
                    <span>Stores</span>
                  </button>
```

---

### CHANGE 11: Add Stores View in Main Content

**FIND (around line 770):**
```typescript
        ) : activeView === 'employees' ? (
          <EmployeeManagement user={{
            role: user.role,
            email: user.email,
            employeeId: user.employeeId,
            name: user.name
          }} />
        ) : (
          <ClusterDashboard context={contextValue} />
        )}
```

**REPLACE WITH:**
```typescript
        ) : activeView === 'employees' ? (
          <EmployeeManagement user={{
            role: user.role,
            email: user.email,
            employeeId: user.employeeId,
            name: user.name
          }} />
        ) : activeView === 'stores' ? (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <StoreManagement onStoreCreated={async () => {
              if (user) {
                const storesData = await api.getStores();
                setStores(storesData);
              }
            }} />
          </div>
        ) : (
          <ClusterDashboard context={contextValue} />
        )}
```

---

## ✅ VERIFICATION CHECKLIST:

After applying all changes:
- [ ] Types updated with storeId
- [ ] Store state variables added
- [ ] loadData loads stores
- [ ] User login/session includes storeId
- [ ] Logout clears store state
- [ ] contextValue includes filtered data + store props
- [ ] Store selector visible for cluster heads
- [ ] Stores button in desktop menu (cluster head)
- [ ] Stores button in mobile menu (cluster head)
- [ ] Stores view renders StoreManagement component

---

## 🎯 TESTING STEPS:

1. **Login as Cluster Head**
   - Should see "Stores" button in nav
   - Should see store selector (if stores exist)

2. **Create First Store**
   - Navigate to Stores view
   - Click "Create Store"
   - Fill in name and location
   - Verify store appears in list

3. **Test Store Selector**
   - Create 2-3 stores
   - Check that store selector appears
   - Select "All Stores" - should see all data
   - Select individual store - should see filtered data

4. **Create Manager with Store**
   - Go to Employee Management
   - Create a new manager
   - Assign them to a store
   - Logout and login as that manager
   - Verify they only see their store's data

5. **Multi-Store Data**
   - As cluster head, select Store A
   - Add inventory/sales data
   - Switch to Store B
   - Add different inventory/sales
   - Switch back to "All Stores"
   - Verify both sets of data appear

---

## 🚨 TROUBLESHOOTING:

**If store selector doesn't appear:**
- Check that stores array has data
- Check that user.role === 'cluster_head'
- Check browser console for errors loading stores

**If data isn't filtering:**
- Check that storeId is being saved with inventory/sales/overhead
- Verify selectedStoreId state is updating
- Check filter logic in contextValue

**If manager can't see data:**
- Verify manager has storeId in user_metadata
- Check that storeId matches the data's storeId
- Verify manager creation includes storeId

