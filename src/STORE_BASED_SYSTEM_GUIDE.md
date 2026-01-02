# Store-Based Multi-Store System Guide

## Current Implementation Status

### ✅ What's Already Working:

1. **Store Management (`/components/StoreManagement.tsx`)**
   - Cluster heads can create new stores
   - Edit store name and location
   - View all stores with manager assignment status
   - Store ID system is in place

2. **Store Selector Component (`/components/StoreSelector.tsx`)**
   - Dropdown to select stores
   - "All Stores" option for combined view
   - Integrated in the system

3. **Database Schema**
   - Employees table has `storeId` field
   - Stores table exists with proper structure
   - Multi-store support is database-ready

4. **User Context**
   - User object includes `storeId` field
   - Authentication supports store assignment

### ⚠️ What Needs Enhancement:

## Missing/Incomplete Features:

### 1. **Store Assignment During Employee Creation**
**File:** `/components/EmployeeManagement.tsx`
**Issue:** When creating employees, `storeId` is not being assigned
**Fix Needed:**
- Add store selector dropdown in the create employee form
- Pass `storeId` to the employee creation API
- Cluster heads should select which store the employee belongs to

### 2. **Manager-Store Assignment Interface**
**Current State:** StoreManagement shows manager status but no UI to assign
**Fix Needed:**
- Add a "Assign Manager" button/dropdown for each store in StoreManagement
- When assigning a manager, also set their `storeId`
- Use `api.assignManagerToStore()` function (already exists)

### 3. **Store-Based Data Filtering**

#### A. **Analytics Dashboard** (`/components/Analytics.tsx`)
**Current:** Shows all data combined
**Needs:**
- Store selector at the top
- Filter all metrics by selected storeId:
  - Inventory expenses by store
  - Overhead expenses by store  
  - Sales revenue by store
  - Employee payouts by store
  - Leave statistics by store (✅ ALREADY DONE)

#### B. **Payroll Management** (`/components/PayrollManagement.tsx`)
**Current:** Shows all employees and payouts
**Needs:**
- Filter employees by storeId
- Filter payouts for employees in selected store
- Show store-specific totals

#### C. **Attendance Portal** (`/components/AttendancePortal.tsx`)
**Current:** Shows all attendance records
**Needs:**
- Filter timesheets by employee's storeId
- Filter leave applications by employee's storeId  
- Show store-specific attendance statistics

#### D. **Employee Management** (`/components/EmployeeManagement.tsx`)
**Current:** Shows all employees
**Needs:**
- Filter employee list by storeId
- Show store name in employee cards
- Allow store transfer functionality

### 4. **Inventory & Sales by Store**
**Files:** `/components/InventoryManagement.tsx`, `/components/SalesManagement.tsx`

**Current:** Data is global
**Needs:**
- Add `storeId` field to inventory items
- Add `storeId` field to sales records
- Add `storeId` field to overhead expenses
- Filter by selected store

### 5. **Store Selector Placement**
**Needs:** Add StoreSelector component to:
- Analytics page header (partially done for leaves)
- Payroll Management header
- Employee Management header
- Attendance Portal header
- Inventory Management header
- Sales Management header

## Implementation Roadmap

### Phase 1: Core Store Assignment (Immediate)
1. ✅ Update EmployeeManagement to assign storeId during creation
2. ✅ Add manager assignment UI in StoreManagement
3. ✅ Ensure all new records (inventory, sales, overheads) include storeId

### Phase 2: Data Filtering (Next)
1. ✅ Add StoreSelector to all main views
2. ✅ Filter Analytics metrics by store
3. ✅ Filter Payroll by store  
4. ✅ Filter Attendance by store
5. ✅ Filter Employees by store

### Phase 3: Reporting & Transfer (Later)
1. ⬜ Store-wise comparison reports
2. ⬜ Employee store transfer functionality
3. ⬜ Cross-store analytics
4. ⬜ Store performance dashboards

## Database Structure

### Stores Table
```typescript
{
  id: string;
  name: string;
  location: string;
  managerId?: string;
  createdAt: string;
}
```

### Employees Table (with storeId)
```typescript
{
  id: string;
  employeeId: string; // BM001, BM002, etc.
  name: string;
  email: string;
  role: 'cluster_head' | 'manager' | 'employee';
  storeId?: string | null; // ✅ Already exists
  managerId?: string;
  clusterHeadId?: string;
  // ... other fields
}
```

### Inventory, Sales, Overheads (need storeId)
```typescript
{
  id: string;
  storeId?: string; // ⚠️ NEEDS TO BE ADDED
  // ... other fields
}
```

## API Functions Available

- `getStores()` - Get all stores
- `createStore(name, location)` - Create new store
- `updateStore(storeId, name, location)` - Update store details
- `assignManagerToStore(storeId, managerId)` - Assign manager to store
- `getAllEmployees()` - Get all employees (includes storeId field)
- `createUnifiedEmployee(data)` - Create employee (can include storeId)

## Access Control Rules

### Cluster Head
- Can see all stores
- Can create/edit stores
- Can assign managers to stores
- Can view combined data or filter by specific store
- Can see all employees across all stores (with store filter)

### Manager
- Can only see their assigned store
- Cannot create stores
- Can only manage employees in their store
- Can only view data for their store

### Employee
- Can only see their own data
- Store is transparent to them

## Current User Flow

1. **Cluster Head logs in**
   - Goes to Store Management
   - Creates stores (e.g., "Downtown Branch", "Main Street Store")
   - Assigns managers to each store
   
2. **Creating Employees**
   - Cluster Head creates manager → selects store → manager gets storeId
   - Manager creates employee → employee automatically gets manager's storeId
   
3. **Viewing Data**
   - Cluster Head selects store from dropdown
   - Sees filtered analytics, payroll, attendance for that store
   - Can select "All Stores" for combined view
   
4. **Manager Experience**
   - Automatically sees only their store's data
   - No store selector (locked to their store)

## Files to Modify

### High Priority
1. `/components/EmployeeManagement.tsx` - Add storeId to employee creation
2. `/components/StoreManagement.tsx` - Add manager assignment UI
3. `/components/Analytics.tsx` - Add store filtering
4. `/components/PayrollManagement.tsx` - Add store filtering
5. `/components/AttendancePortal.tsx` - Add store filtering

### Medium Priority
6. `/components/InventoryManagement.tsx` - Add storeId to items
7. `/components/SalesManagement.tsx` - Add storeId to sales
8. `/components/OverheadForm.tsx` - Add storeId to overheads
9. `/App.tsx` - Integrate store selector globally

### Backend
10. `/supabase/functions/server/index.tsx` - Ensure store filtering in API endpoints
