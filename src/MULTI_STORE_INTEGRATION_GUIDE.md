# Multi-Store Integration Guide for App.tsx

This guide contains all the code changes needed to complete the multi-store integration.

---

## STEP 1: Update Type Definitions (Lines 26-67)

**FIND THIS:**
```typescript
export type InventoryItem = {
  id: string;
  date: string;
  category: 'vegetables_herbs' | 'grocery_spices' | 'dairy' | 'meat' | 'packaging' | 'gas_utilities' | 'production' | 'staff_misc';
  itemName: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  totalCost: number;
};

export type OverheadItem = {
  id: string;
  date: string;
  category: 'fuel' | 'travel' | 'transportation' | 'marketing' | 'service_charge' | 'repair';
  description: string;
  amount: number;
};

export type SalesData = {
  id: string;
  date: string;
  offlineSales: number;
  paytmAmount: number;
  cashAmount: number;
  onlineSales: number;
  employeeSalary: number;
  previousCashInHand: number;
  usedOnlineMoney: number;
  actualCashInHand: number;
  cashOffset: number;
  approvalRequired: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalRequested: boolean;
  approvalRequestedAt: string | null;
  requestedCashInHand: number | null;
  requestedOffset: number | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
};
```

**REPLACE WITH:**
```typescript
export type InventoryItem = {
  id: string;
  date: string;
  category: 'vegetables_herbs' | 'grocery_spices' | 'dairy' | 'meat' | 'packaging' | 'gas_utilities' | 'production' | 'staff_misc';
  itemName: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  totalCost: number;
  storeId?: string | null;
};

export type OverheadItem = {
  id: string;
  date: string;
  category: 'fuel' | 'travel' | 'transportation' | 'marketing' | 'service_charge' | 'repair';
  description: string;
  amount: number;
  storeId?: string | null;
};

export type SalesData = {
  id: string;
  date: string;
  offlineSales: number;
  paytmAmount: number;
  cashAmount: number;
  onlineSales: number;
  employeeSalary: number;
  previousCashInHand: number;
  usedOnlineMoney: number;
  actualCashInHand: number;
  cashOffset: number;
  approvalRequired: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalRequested: boolean;
  approvalRequestedAt: string | null;
  requestedCashInHand: number | null;
  requestedOffset: number | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  storeId?: string | null;
};
```

---

## STEP 2: Update InventoryContextType (Lines 69-87)

**FIND THIS:**
```typescript
export type InventoryContextType = {
  inventory: InventoryItem[];
  overheads: OverheadItem[];
  salesData: SalesData[];
  addInventoryItem: (item: Omit<InventoryItem, 'id'>) => Promise<void>;
  addOverheadItem: (item: Omit<OverheadItem, 'id'>) => Promise<void>;
  updateInventoryItem: (id: string, item: Omit<InventoryItem, 'id'>) => Promise<void>;
  updateOverheadItem: (id: string, item: Omit<OverheadItem, 'id'>) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;
  deleteOverheadItem: (id: string) => Promise<void>;
  addSalesData: (item: Omit<SalesData, 'id'>) => Promise<void>;
  updateSalesData: (id: string, item: Omit<SalesData, 'id'>) => Promise<void>;
  approveSalesData: (id: string) => Promise<void>;
  requestSalesApproval: (id: string, requestedCashInHand: number, requestedOffset: number) => Promise<void>;
  approveDiscrepancy: (id: string) => Promise<void>;
  rejectDiscrepancy: (id: string, reason: string) => Promise<void>;
  isManager: boolean;
  user: { email: string; name: string; role: string; employeeId: string | null; accessToken: string } | null;
};
```

**REPLACE WITH:**
```typescript
export type InventoryContextType = {
  inventory: InventoryItem[];
  overheads: OverheadItem[];
  salesData: SalesData[];
  addInventoryItem: (item: Omit<InventoryItem, 'id'>) => Promise<void>;
  addOverheadItem: (item: Omit<OverheadItem, 'id'>) => Promise<void>;
  updateInventoryItem: (id: string, item: Omit<InventoryItem, 'id'>) => Promise<void>;
  updateOverheadItem: (id: string, item: Omit<OverheadItem, 'id'>) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;
  deleteOverheadItem: (id: string) => Promise<void>;
  addSalesData: (item: Omit<SalesData, 'id'>) => Promise<void>;
  updateSalesData: (id: string, item: Omit<SalesData, 'id'>) => Promise<void>;
  approveSalesData: (id: string) => Promise<void>;
  requestSalesApproval: (id: string, requestedCashInHand: number, requestedOffset: number) => Promise<void>;
  approveDiscrepancy: (id: string) => Promise<void>;
  rejectDiscrepancy: (id: string, reason: string) => Promise<void>;
  isManager: boolean;
  user: { email: string; name: string; role: string; employeeId: string | null; accessToken: string; storeId?: string | null } | null;
  stores: api.Store[];
  selectedStoreId: string | null;
  onStoreChange: (storeId: string | null) => void;
};
```

---

## STEP 3: Add Store State Variables (After line 100)

**FIND THIS:**
```typescript
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Get singleton Supabase client
  const supabaseClient = getSupabaseClient();
```

**ADD AFTER `const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);`:**
```typescript
  const [stores, setStores] = useState<api.Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
```

---

## STEP 4: Update activeView Type (Line 91)

**FIND THIS:**
```typescript
  const [activeView, setActiveView] = useState<'inventory' | 'sales' | 'payroll' | 'analytics' | 'export' | 'attendance' | 'employees'>('analytics');
```

**REPLACE WITH:**
```typescript
  const [activeView, setActiveView] = useState<'inventory' | 'sales' | 'payroll' | 'analytics' | 'export' | 'attendance' | 'employees' | 'stores'>('analytics');
```

---

## STEP 5: Update loadData Function to Load Stores (Lines 110-128)

**FIND THIS:**
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
    } finally {
      setIsLoadingData(false);
    }
  };
```

**REPLACE WITH:**
```typescript
  const loadData = async (accessToken: string, userRole?: string, userStoreId?: string | null) => {
    setIsLoadingData(true);
    setDataError(null);
    try {
      const [inventoryData, overheadsData, salesData, storesData] = await Promise.all([
        api.fetchInventory(accessToken),
        api.fetchOverheads(accessToken),
        api.fetchSalesData(accessToken),
        api.getStores()
      ]);
      setInventory(inventoryData);
      setOverheads(overheadsData);
      setSalesData(salesData);
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

## STEP 6: Update checkSession useEffect (Around line 147)

**FIND THIS:**
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

## STEP 7: Update handleLogin Function (Around line 170)

**FIND THIS:**
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

## STEP 8: Update handleLogout Function (Around line 210)

**FIND THIS:**
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

## STEP 9: Update contextValue (Around line 290)

**FIND THIS:**
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

## STEP 10: Add Store Selector Below Navigation (After nav closing tag)

**FIND the nav closing tag and the "Data Error Banner" section. ADD THIS BEFORE THE DATA ERROR BANNER:**

```typescript
      {/* Store Selector for Cluster Heads */}
      {isClusterHead && stores.length > 0 && !isEmployee && (
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

## STEP 11: Add Stores Button to Cluster Head Desktop Menu

**IN THE CLUSTER HEAD DESKTOP MENU (around line 500), FIND THIS:**
```typescript
                  <button
                    onClick={() => setActiveView('employees')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      activeView === 'employees'
                        ? 'bg-[#E6E6FA] text-gray-800 border-2 border-[#D8BFD8]'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F8F8FF] border-2 border-transparent'
                    }`}
                  >
                    <UserPlus className="w-4 h-4" />
                    <span className="hidden xl:inline">Employees</span>
                  </button>
                </>
```

**ADD THIS AFTER THE EMPLOYEES BUTTON (before the closing `</>`):**
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

## STEP 12: Add Stores Button to Cluster Head Mobile Menu

**IN THE CLUSTER HEAD MOBILE MENU (around line 680), FIND THIS:**
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
                    <UserPlus className="w-5 h-5" />
                    <span>Employees</span>
                  </button>
                </>
```

**ADD THIS AFTER THE EMPLOYEES BUTTON (before the closing `</>`):**
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

## STEP 13: Add Stores View in Main Content (Around line 750)

**FIND THE MAIN CONTENT SECTION WITH THE activeView CONDITIONS:**
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

## STEP 14: Import Store Icon (Line 21)

**FIND THIS:**
```typescript
import { Package, BarChart3, LogOut, AlertCircle, DollarSign, Trash2, Users, TrendingUp, Download, Menu, X, Clock, Calendar, UserPlus, CheckSquare } from 'lucide-react';
```

**REPLACE WITH (if not already updated):**
```typescript
import { Package, BarChart3, LogOut, AlertCircle, DollarSign, Trash2, Users, TrendingUp, Download, Menu, X, Clock, Calendar, UserPlus, CheckSquare, Store } from 'lucide-react';
```

Note: If you're already using `Package` for the Stores button, that's fine. Otherwise, import `Store` from lucide-react.

---

## ✅ INTEGRATION COMPLETE!

After applying all these changes:
1. ✅ Cluster heads can create/manage stores
2. ✅ Cluster heads can view individual store data or "All Stores" combined
3. ✅ Managers are locked to their assigned store
4. ✅ All inventory/sales/overhead data is filtered by store
5. ✅ Store selector appears at the top for cluster heads
6. ✅ Employee hierarchy shows store information

**Test the integration:**
1. Login as cluster head
2. Navigate to "Stores" view
3. Create a new store
4. Create a manager and assign them to the store
5. Use the store selector to filter data
6. Test "All Stores" combined view
