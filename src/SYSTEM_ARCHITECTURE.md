# System Architecture - Advanced Inventory Management

## Overview
This document outlines the technical architecture of the Advanced Inventory Management system within Bhandar-IMS.

---

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│                    (Advanced Inventory Management)              │
└─────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │   7 Feature Tabs          │
                    └─────────────┬─────────────┘
                                  │
        ┌─────────┬───────┬──────┼──────┬───────┬─────────┐
        │         │       │      │      │       │         │
        ▼         ▼       ▼      ▼      ▼       ▼         ▼
   Dashboard   Stock   Alerts Requests Reports Forecast Rankings
        │         │       │      │      │       │         │
        └─────────┴───────┴──────┴──────┴───────┴─────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │   Context & Data Layer     │
                    └─────────────┬─────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
   Inventory Data          Production Data           Sales Data
        │                         │                         │
        │                         │                         │
        ▼                         ▼                         ▼
  Stock Requests         Production Houses              Stores
        │                         │                         │
        └─────────────────────────┴─────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │     Backend API Layer      │
                    │  (Supabase Edge Functions) │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │    Database (PostgreSQL)   │
                    │         via KV Store       │
                    └───────────────────────────┘
```

---

## 📦 Component Structure

```
/components
├── AdvancedInventoryManagement.tsx    [Main Container]
│   ├── StoreStockStatus.tsx          [Tab 1: Stock Status]
│   ├── InventoryAlerts.tsx           [Tab 2: Alerts]
│   ├── EnhancedProductionRequests.tsx [Tab 3: Requests]
│   ├── ReportsVisualization.tsx       [Tab 4: Reports]
│   ├── InventoryDashboard.tsx         [Tab 5: Dashboard]
│   ├── PredictiveAnalytics.tsx        [Tab 6: Forecast]
│   └── StorePerformanceComparison.tsx [Tab 7: Rankings]
```

### Component Hierarchy

```
App.tsx
  └── AdvancedInventoryManagement
      ├── Tabs Navigation (7 tabs)
      ├── TabsContent (Dashboard)
      │   └── InventoryDashboard
      │       ├── Key Metrics Cards
      │       ├── Production vs Sales Chart
      │       ├── Production House Performance
      │       ├── Store Performance
      │       └── Cost Analysis Chart
      │
      ├── TabsContent (Stock)
      │   └── StoreStockStatus
      │       ├── Summary Cards
      │       ├── Store Filter
      │       └── Stock Detail Cards
      │
      ├── TabsContent (Alerts)
      │   └── InventoryAlerts
      │       ├── Alert Filter
      │       └── Alert List
      │
      ├── TabsContent (Requests)
      │   └── EnhancedProductionRequests
      │       ├── Create Request Form
      │       ├── My Requests Tab
      │       ├── Pending Fulfillment Tab
      │       └── History Tab
      │
      ├── TabsContent (Reports)
      │   └── ReportsVisualization
      │       ├── Report Type Tabs
      │       ├── Sales Report
      │       ├── Production Report
      │       ├── Inventory Report
      │       └── Financial Report
      │
      ├── TabsContent (Forecast)
      │   └── PredictiveAnalytics
      │       ├── 7-Day Forecast
      │       ├── Stock-out Risk Analysis
      │       ├── Optimal Production Schedule
      │       └── Trend Charts
      │
      └── TabsContent (Rankings)
          └── StorePerformanceComparison
              ├── Top 3 Performers
              ├── Multi-dimensional Radar Chart
              ├── Comparison Bar Chart
              └── Detailed Metrics Table
```

---

## 🔄 Data Flow Architecture

### 1. Data Loading Flow

```
User Login
    │
    ▼
App.tsx useEffect()
    │
    ├── Load Inventory Data
    ├── Load Sales Data
    ├── Load Production Data
    ├── Load Stock Requests
    ├── Load Production Houses
    └── Load Stores
    │
    ▼
Context Provider (InventoryContextType)
    │
    ▼
All Child Components Access Data via Props
```

### 2. Stock Calculation Flow

```
Stock Requests (Fulfilled)
    │
    ▼
Extract Fulfilled Quantities
    │
    ▼
Sum by Product Type
    │
    ▼
Subtract Estimated Sales ──────┐
    │                          │
    ▼                          │
Current Stock per Product      │
    │                          │
    ▼                          │
Apply Status Thresholds        │
    │                          │
    ▼                          │
Display with Color Coding ◄────┘
```

### 3. Alert Generation Flow

```
Load All Data
    │
    ▼
Calculate Current Stock ──────┐
    │                         │
    ▼                         │
Check Thresholds             │
    │                         │
    ├── Out of Stock? ────────┤
    ├── Low Stock? ───────────┤
    └── Pending Requests? ────┤
    │                         │
    ▼                         │
Generate Alert Objects ◄──────┘
    │
    ▼
Sort by Severity
    │
    ▼
Display in UI
```

### 4. Report Generation Flow

```
Select Report Type & Date Range
    │
    ▼
Filter Data by Date Range
    │
    ├── Sales Data
    ├── Production Data
    ├── Inventory Data
    └── Overhead/Fixed Costs
    │
    ▼
Aggregate & Calculate Metrics
    │
    ├── Sum totals
    ├── Calculate averages
    ├── Compute percentages
    └── Group by categories
    │
    ▼
Prepare Chart Data
    │
    ▼
Render Visualizations
```

### 5. Prediction Flow

```
Historical Data (30 days)
    │
    ▼
Calculate Averages
    │
    ├── Avg Daily Sales
    ├── Avg Production
    └── Sales Velocity
    │
    ▼
Apply Forecasting Logic
    │
    ├── Linear Trend
    ├── Weekend Adjustment (+30%)
    └── Safety Buffer (+10%)
    │
    ▼
Generate 7-Day Forecast
    │
    ▼
Calculate Risk Levels
    │
    ▼
Display Predictions
```

---

## 🗃️ Data Models

### StoreStockStatus Type
```typescript
type StockStatus = {
  storeId: string;
  storeName: string;
  productionHouseName: string;
  inventory: {
    chicken: number;
    chickenCheese: number;
    veg: number;
    cheeseCorn: number;
    paneer: number;
    vegKurkure: number;
    chickenKurkure: number;
  };
  status: 'healthy' | 'low' | 'critical' | 'out';
  lastUpdated: string;
}
```

### Alert Type
```typescript
type Alert = {
  id: string;
  type: 'low_stock' | 'out_of_stock' | 'pending_request';
  severity: 'high' | 'medium' | 'low';
  storeId: string;
  storeName: string;
  product?: string;
  quantity?: number;
  message: string;
  actionRequired: string;
  timestamp: string;
}
```

### StoreMetrics Type
```typescript
type StoreMetrics = {
  storeId: string;
  storeName: string;
  totalSales: number;
  totalRequests: number;
  fulfillmentRate: number;
  avgRequestSize: number;
  salesGrowth: number;
  efficiency: number;
  overallScore: number;
  rank: number;
}
```

---

## 🔐 Access Control

### Role-Based Permissions

```
┌─────────────────┬──────────────┬─────────────────┬─────────────┐
│    Feature      │ Cluster Head │ Ops Manager     │   Employee  │
├─────────────────┼──────────────┼─────────────────┼─────────────┤
│ Access System   │      ✅      │       ✅        │      ❌     │
│ View Dashboard  │      ✅      │       ✅        │      ❌     │
│ Stock Status    │      ✅      │       ✅        │      ❌     │
│ Alerts          │      ✅      │       ✅        │      ❌     │
│ Create Requests │      ✅*     │       ✅*       │      ❌     │
│ Fulfill Req.    │      ✅**    │       ✅**      │      ❌     │
│ Reports         │      ✅      │       ✅        │      ❌     │
│ Forecast        │      ✅      │       ✅        │      ❌     │
│ Rankings        │      ✅      │       ✅        │      ❌     │
└─────────────────┴──────────────┴─────────────────┴─────────────┘

* If designated as store_incharge
** If designated as production_incharge
```

---

## 🎨 UI Component Library

### Shadcn/UI Components Used

```
/components/ui/
├── card.tsx           [Card containers]
├── badge.tsx          [Status badges]
├── button.tsx         [Action buttons]
├── tabs.tsx           [Tab navigation]
├── select.tsx         [Dropdown selects]
└── [Other UI components from existing system]
```

### Chart Library

```
recharts (npm package)
├── LineChart         [Trend lines]
├── BarChart          [Comparisons]
├── PieChart          [Distributions]
├── AreaChart         [Cumulative data]
└── RadarChart        [Multi-dimensional]
```

---

## 💾 State Management

### Local Component State (useState)
- Tab selection
- Form inputs
- Filters and selections
- UI toggles

### Memoized Computations (useMemo)
- Stock calculations
- Alert generation
- Report aggregations
- Predictions
- Rankings

### Context Props
- Inventory data
- Sales data
- Production data
- Stock requests
- Production houses
- Stores
- User information

---

## 🔄 Update Patterns

### Data Refresh Flow

```
User Action (e.g., Create Request)
    │
    ▼
API Call to Backend
    │
    ▼
Backend Updates Database
    │
    ▼
Success Response
    │
    ▼
Update Local State
    │
    ▼
Trigger Re-render
    │
    ▼
useMemo Recalculates
    │
    ▼
UI Updates Automatically
```

### Auto-refresh Triggers
- Page load
- Tab switch
- Data modification
- User action completion

---

## 📊 Performance Optimization

### Strategies Implemented

1. **Memoization**
   ```typescript
   const analytics = useMemo(() => {
     // Expensive calculations
     return computedData;
   }, [dependencies]);
   ```

2. **Lazy Loading**
   - Charts only render when tab is active
   - Data filtered before processing

3. **Efficient Filtering**
   ```typescript
   const filteredData = data.filter(condition);
   // Use filteredData multiple times
   ```

4. **Minimal Re-renders**
   - State updates only when necessary
   - Proper dependency arrays in hooks

---

## 🔌 Integration Points

### With Existing System

```
App.tsx
├── Auth System ✅
├── Navigation ✅
├── Data Loading ✅
├── Context Provider ✅
└── Routing ✅

Shared Components
├── UI Components ✅
├── Icons (lucide-react) ✅
└── Styling (Tailwind) ✅

Backend API
├── Inventory endpoints ✅
├── Sales endpoints ✅
├── Production endpoints ✅
├── Stock request endpoints ✅
└── Authentication ✅
```

---

## 🧪 Testing Strategy

### Component Testing
```
Each Component
├── Renders correctly
├── Handles empty data
├── Calculates accurately
├── Responds to user actions
└── Updates on data changes
```

### Integration Testing
```
End-to-End Flow
├── User logs in
├── Navigates to feature
├── Views data
├── Performs action
├── Sees update
└── Logs out
```

---

## 🚀 Deployment Architecture

```
Developer
    │
    ▼
Git Repository
    │
    ▼
Build Process (Vite)
    │
    ├── TypeScript Compilation
    ├── Component Bundling
    ├── CSS Processing
    └── Asset Optimization
    │
    ▼
Production Build
    │
    ▼
Netlify / Hosting Platform
    │
    ▼
End Users
```

---

## 🔐 Security Considerations

### Data Protection
- ✅ Role-based access control
- ✅ JWT authentication
- ✅ Secure API calls
- ✅ No sensitive data in client

### Input Validation
- ✅ Form validation
- ✅ Type checking (TypeScript)
- ✅ Range validation
- ✅ Required field checks

---

## 📈 Scalability

### Current Capacity
- Handles multiple stores
- Processes large datasets
- Efficient calculations
- Fast rendering

### Future Scalability
- Add more product types ✓
- Support more stores ✓
- Handle more historical data ✓
- Add more metrics ✓

---

## 🔧 Maintenance

### Code Organization
```
/components
  /AdvancedInventory     [Feature folder]
    ├── Main components
    ├── Sub-components
    └── Utilities

Clear naming conventions
Type safety with TypeScript
Documented functions
Reusable patterns
```

### Update Process
1. Modify component
2. Test locally
3. Commit changes
4. Deploy to production
5. Monitor for issues

---

## 📚 Technology Stack

```
Frontend
├── React 18+
├── TypeScript
├── Tailwind CSS
├── Shadcn/UI
├── Recharts
└── Lucide Icons

Backend
├── Supabase
├── PostgreSQL
├── Edge Functions
└── Authentication

Build Tools
├── Vite
├── ESLint
└── TypeScript Compiler
```

---

**Architecture Document v1.0**
**Last Updated:** December 30, 2024
**Maintained by:** Bhandar-IMS Development Team
