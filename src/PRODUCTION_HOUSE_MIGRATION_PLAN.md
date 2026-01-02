# 🏭 Production House Migration Plan

## Overview
Migrating from a Production Request system to a **Production House with Stock Inventory** system.

## Key Changes

### 1. **New Entities**
- ✅ `ProductionHouse` - Central inventory hub
  - Has inventory levels for all momo types
  - Has a Production Head assigned to it
  - Location and name
  
- ✅ `StockRequest` - Replaces ProductionRequest
  - Store requests stock from their mapped Production House
  - Production House can fulfill full/partial quantities
  - Tracks requested vs fulfilled quantities

### 2. **Updated Entities**
- ✅ `Store` - Now has `productionHouseId` mapping
- ✅ `ProductionData` - Changed from `storeId` to `productionHouseId`
- Employee (Production Head) - Will be mapped to `productionHouseId` instead of `storeId`

### 3. **New Workflow**

#### **Current (OLD) Workflow:**
```
Store Incharge → Creates Production Request → Production Head produces → Updates status
```

#### **New Workflow:**
```
Production Head → Produces momos → Updates Production House Inventory ↑
Store Incharge → Requests Stock → Production House checks inventory
Production Head → Fulfills request (full/partial) → Updates inventory ↓
```

### 4. **Inventory Tracking Logic**
```javascript
Production House Inventory = 
  Previous Inventory 
  + New Production (from ProductionData)
  - Stock sent to stores (from fulfilled StockRequests)
```

## Implementation Steps

### ✅ Phase 1: Frontend Type Definitions (COMPLETED)
- [x] Add `ProductionHouse` interface in `/utils/api.ts`
- [x] Add `StockRequest` interface in `/utils/api.ts`
- [x] Update `Store` interface to include `productionHouseId`
- [x] Update `ProductionData` type to use `productionHouseId` instead of `storeId`
- [x] Add API functions for Production House management
- [x] Add API functions for Stock Request management

### 📋 Phase 2: Backend Implementation (TODO)
- [ ] Create `/supabase/functions/server/production-houses.ts` route handler
- [ ] Create `/supabase/functions/server/stock-requests.ts` route handler
- [ ] Update employee designation logic to support `productionHouseId` for Production Heads
- [ ] Add migration script to:
  - Create initial Production House(s)
  - Map existing stores to Production House
  - Convert `ProductionData.storeId` to `ProductionData.productionHouseId`
  - Initialize Production House inventory from recent production data

### 📋 Phase 3: UI Components (TODO)
- [ ] Create `ProductionHouseManagement.tsx` component (Cluster Head only)
  - View all production houses
  - Create new production house
  - Assign production head to production house
  - View current inventory levels
  
- [ ] Update `StoreManagement.tsx` component
  - Add ability to assign/change Production House mapping for each store
  
- [ ] Create `StockRequestManagement.tsx` component
  - **For Store Incharge**: Create stock requests to their mapped Production House
  - **For Production Head**: View pending requests, fulfill with inventory check
  
- [ ] Update `ProductionManagement.tsx` component
  - Production entry should update Production House inventory
  - Show current inventory levels
  - Use `productionHouseId` instead of `storeId`
  
- [ ] Update `EmployeeManagement.tsx` component
  - When assigning Production Incharge designation, also assign `productionHouseId`

### 📋 Phase 4: Analytics & Reporting (TODO)
- [ ] Update Analytics dashboard to show:
  - Production House inventory levels
  - Stock request fulfillment rates
  - Production vs consumption trends
  
- [ ] Create Production House Dashboard showing:
  - Current inventory
  - Pending stock requests
  - Production history
  - Fulfillment history

## Database Schema Changes

### New Tables in KV Store:

#### `production-houses`
```typescript
{
  id: string;
  name: string;
  location: string;
  productionHeadId: string | null;
  inventory: {
    chicken: number;
    chickenCheese: number;
    veg: number;
    cheeseCorn: number;
    paneer: number;
    vegKurkure: number;
    chickenKurkure: number;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
```

#### `stock-requests`
```typescript
{
  id: string;
  storeId: string;
  storeName: string;
  productionHouseId: string;
  productionHouseName: string;
  requestedBy: string; // Employee ID
  requestedByName: string;
  requestDate: string;
  requestedQuantities: { ... };
  fulfilledQuantities: { ... } | null;
  status: 'pending' | 'fulfilled' | 'partially_fulfilled' | 'cancelled';
  fulfilledBy: string | null;
  fulfilledByName: string | null;
  fulfillmentDate: string | null;
  notes: string | null;
}
```

### Updated Tables:

#### `stores` - Add field
```typescript
productionHouseId: string | null;
```

#### `production` - Change field
```typescript
// OLD: storeId?: string;
// NEW: productionHouseId?: string;
```

#### `employees` - Update logic
```typescript
// Production Heads should have productionHouseId instead of storeId
// When designation === 'production_incharge', assign productionHouseId
```

## Migration Strategy

### Data Migration Script:
1. Create default Production House "Main Production House"
2. Map all existing stores to this Production House
3. Find all Production Heads and assign them to this Production House
4. Convert existing `ProductionData` records:
   - Change `storeId` field to `productionHouseId`
   - Use the default Production House ID
5. Calculate initial inventory from last 7 days of production data
6. Convert existing `ProductionRequest` to `StockRequest` format

## Backward Compatibility Notes

⚠️ **Breaking Changes:**
- `ProductionData.storeId` → `ProductionData.productionHouseId`
- Production Heads will no longer have `storeId`, they'll have `productionHouseId`
- Stock Requests replace Production Requests completely

## Testing Checklist
- [ ] Production Head can log production and see inventory update
- [ ] Store Incharge can request stock from their mapped Production House
- [ ] Production Head can fulfill requests (full/partial)
- [ ] Inventory decreases correctly after fulfillment
- [ ] Cluster Head can manage Production Houses
- [ ] Cluster Head can change store-to-production-house mappings
- [ ] Analytics show correct inventory and production data

## Benefits of New System
1. ✅ **Realistic Workflow** - Matches actual business operations
2. ✅ **Inventory Tracking** - Real-time stock levels at Production House
3. ✅ **Scalability** - Multiple production houses can be added easily
4. ✅ **Flexibility** - Production can fulfill partial requests based on availability
5. ✅ **Better Analytics** - Track production efficiency and stock movement

## Next Steps
1. Implement backend routes for Production House and Stock Requests
2. Create migration script
3. Build UI components
4. Test thoroughly with sample data
5. Deploy and migrate existing data
