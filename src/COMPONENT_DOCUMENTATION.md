# Component Documentation

Complete reference for all React components in Bhandar-IMS.

## Table of Contents
1. [Main Application](#main-application)
2. [Authentication Components](#authentication-components)
3. [Dashboard Components](#dashboard-components)
4. [Inventory Components](#inventory-components)
5. [Production Components](#production-components)
6. [Employee Components](#employee-components)
7. [Analytics Components](#analytics-components)
8. [UI Components](#ui-components)

---

## Main Application

### App.tsx
**Purpose:** Root application component with routing logic and global state management.

**Key Features:**
- User authentication state
- Global inventory, sales, and employee data
- View routing (inventory, sales, payroll, analytics, etc.)
- Role-based UI rendering
- Automatic session checking on mount
- Push notification initialization

**State Management:**
- `user` - Current logged-in user
- `inventory` - Global inventory items
- `salesData` - Sales records
- `employees` - Employee list
- `stores` - Store list
- `productionHouses` - Production house list
- `stockRequests` - Stock request list
- `productionRequests` - Production request list

**Views:**
- Analytics Dashboard
- Inventory Management
- Sales Management
- Payroll Management
- Employee Management
- Production Management
- Stock Requests
- Advanced Inventory

---

## Authentication Components

### AuthPage.tsx
**Path:** `/components/AuthPage.tsx`

**Purpose:** Login and signup interface.

**Props:**
```typescript
{
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, name: string, role: string) => Promise<void>;
  error: string | null;
}
```

**Features:**
- Email/password login
- Toggle between sign in and sign up
- Error message display
- Glassmorphism design
- Responsive layout

---

## Dashboard Components

### ClusterDashboard.tsx
**Path:** `/components/ClusterDashboard.tsx`

**Purpose:** Main analytics dashboard for Cluster Heads with overview of all operations.

**Props:** Receives full `InventoryContextType`

**Features:**
- Total revenue calculation across all stores
- Inventory summary by category
- Overhead cost breakdown
- Sales trends chart
- Top selling items
- Store performance comparison
- Low stock alerts

**Charts:**
- Revenue trend (Line chart)
- Sales by category (Bar chart)
- Overhead distribution (Pie chart)

---

### EmployeeDashboard.tsx
**Path:** `/components/EmployeeDashboard.tsx`

**Purpose:** Limited dashboard for employees showing read-only information.

**Features:**
- Personal information display
- Store assignment
- Organizational hierarchy
- Leave balance
- Attendance summary

---

## Inventory Components

### InventoryManagement.tsx
**Path:** `/components/InventoryManagement.tsx`

**Purpose:** Main inventory management interface.

**Features:**
- Add/edit/delete inventory items
- Category-based organization
- Store filtering (for managers)
- Search and filter
- Inventory forms integration

**Components Used:**
- `InventoryForm` - Add/edit items
- `InventoryList` - Display inventory

---

### InventoryView.tsx
**Path:** `/components/InventoryView.tsx`

**Purpose:** Read-only inventory viewer for employees.

**Features:**
- View inventory items
- Category filtering
- Store-specific view
- No edit capabilities

---

### InventoryForm.tsx
**Path:** `/components/InventoryForm.tsx`

**Purpose:** Form for adding/editing inventory items.

**Props:**
```typescript
{
  item?: InventoryItem;
  onSave: (item: Omit<InventoryItem, 'id'>) => Promise<void>;
  onClose: () => void;
  storeId?: string;
}
```

**Features:**
- Category selection
- Item name (dynamic based on category)
- Quantity and unit
- Date selection
- Custom item support
- Form validation

---

### InventoryList.tsx
**Path:** `/components/InventoryList.tsx`

**Purpose:** Displays inventory, overhead, and fixed cost items in categorized lists.

**Features:**
- Tabbed interface (Inventory, Overheads, Fixed Costs)
- Category-wise grouping
- Edit/delete actions
- Empty state handling
- Store filtering

---

### AdvancedInventoryManagement.tsx
**Path:** `/components/AdvancedInventoryManagement.tsx`

**Purpose:** Advanced inventory features including transfers, analytics, and alerts.

**Features:**
- Inventory transfer between locations
- Predictive analytics
- Store performance comparison
- Production house stock status
- Stock threshold settings
- Low stock alerts

**Components Used:**
- `PredictiveAnalytics`
- `StorePerformanceComparison`
- `ProductionHouseStockStatus`
- `StockThresholdSettings`
- `InventoryAlerts`

---

### InventoryAlerts.tsx
**Path:** `/components/InventoryAlerts.tsx`

**Purpose:** Display low stock warnings based on configured thresholds.

**Features:**
- Real-time threshold monitoring
- Alert severity levels
- Location-based filtering
- Quick action buttons

---

### StockThresholdSettings.tsx
**Path:** `/components/StockThresholdSettings.tsx`

**Purpose:** Configure minimum stock levels for alerts.

**Features:**
- Per-item threshold configuration
- Store-specific settings
- Bulk threshold updates
- Threshold templates

---

## Production Components

### ProductionManagement.tsx
**Path:** `/components/ProductionManagement.tsx`

**Purpose:** 7-day production logging for momo types, wastage, and sauce production.

**Features:**
- 7-day date selector
- Production logging for all momo types:
  - Chicken Momos
  - Chicken Cheese Momos
  - Veg Momos
  - Cheese Corn Momos
  - Paneer Momos
  - Veg Kurkure Momos
  - Chicken Kurkure Momos
- Wastage tracking by category
- Sauce/chutney production logging
- Approval workflow
- Store filtering

---

### ProductionRequests.tsx
**Path:** `/components/ProductionRequests.tsx`

**Purpose:** Basic production request interface (legacy).

**Note:** Being replaced by `EnhancedProductionRequests.tsx`

---

### EnhancedProductionRequests.tsx
**Path:** `/components/EnhancedProductionRequests.tsx`

**Purpose:** Advanced production request workflow system.

**Features:**
- Create production requests (Store In-Charge)
- 5-stage status workflow:
  1. Pending
  2. Accepted
  3. In Preparation
  4. Prepared
  5. Shipped
  6. Delivered
- Momos quantity input (all 7 types)
- Kitchen utilities request (with quantity and unit)
- Sauces request (boolean toggles)
- Notes and special instructions
- Request history
- Status filtering
- Store-specific view

---

### ProductionHouseManagement.tsx
**Path:** `/components/ProductionHouseManagement.tsx`

**Purpose:** Manage production houses and their inventory.

**Features:**
- Create/edit/delete production houses
- Assign production heads
- Update inventory levels for all momo types
- Transfer inventory between production houses
- View production house details
- Inventory history tracking

---

### ProductionHouseStockStatus.tsx
**Path:** `/components/ProductionHouseStockStatus.tsx`

**Purpose:** Real-time stock status dashboard for production houses.

**Features:**
- Current stock levels
- Stock trends
- Fulfillment capacity
- Low stock warnings
- Inventory charts

---

## Stock Request Components

### StockRequestManagement.tsx
**Path:** `/components/StockRequestManagement.tsx`

**Purpose:** Manage stock requests from stores to production houses.

**Features:**
- Create stock requests (Store In-Charge)
- View pending requests
- Fulfill requests (Production Head)
- Partial fulfillment support
- Request history
- Status tracking:
  - Pending
  - Fulfilled
  - Partially Fulfilled
  - Cancelled

**Workflow:**
1. Store In-Charge creates request
2. Production Head reviews
3. Production Head fulfills (full or partial)
4. Inventory automatically updated

---

### MonthlyStockRecalibration.tsx
**Path:** `/components/MonthlyStockRecalibration.tsx`

**Purpose:** Monthly physical stock verification system.

**Features:**
- Input actual physical stock counts
- Automatic difference calculation (actual - system)
- Adjustment type categorization:
  - Wastage
  - Counting Error
- Notes for each item
- Submit for approval (Manager)
- Approve/reject workflow (Cluster Head)
- Complete audit trail
- Historical recalibration view

**Workflow:**
1. Manager performs physical count
2. Manager enters actual quantities
3. System calculates differences
4. Manager categorizes adjustments
5. Manager submits for approval
6. Cluster Head reviews and approves/rejects
7. Upon approval, inventory is updated

---

### RecalibrationReports.tsx
**Path:** `/components/RecalibrationReports.tsx`

**Purpose:** View and analyze stock recalibration history.

**Features:**
- Monthly wastage summaries
- Variance analysis
- Location-wise reports
- Approval status tracking
- Export reports
- Wastage trends

---

## Employee Components

### EmployeeManagement.tsx
**Path:** `/components/EmployeeManagement.tsx`

**Purpose:** Complete employee management interface.

**Features:**
- Create employees (with auto-generated auth accounts)
- Assign roles (cluster_head, manager, employee)
- Assign designations (store_incharge, production_incharge)
- Assign to stores/production houses
- View employee hierarchy
- Reset passwords
- Archive employees
- Employment type tracking (full-time, contract)

**Components Used:**
- `CreateEmployee` - Employee creation form
- `EmployeeHierarchy` - Hierarchy visualization
- `EmployeeDetailsModal` - Employee details popup

---

### CreateEmployee.tsx
**Path:** `/components/CreateEmployee.tsx`

**Purpose:** Form for creating new employees.

**Features:**
- Employee ID input
- Name and email
- Password generation
- Role selection
- Designation selection
- Store/production house assignment
- Manager assignment
- Employment type selection
- Joining date

---

### EmployeeHierarchy.tsx
**Path:** `/components/EmployeeHierarchy.tsx`

**Purpose:** Visual representation of organizational hierarchy.

**Features:**
- Tree structure display
- Cluster Head → Manager → Employee chain
- Store assignments
- Designation badges
- Quick actions (edit, delete)

---

### EmployeeHierarchyView.tsx
**Path:** `/components/EmployeeHierarchyView.tsx`

**Purpose:** Full-screen hierarchy view for employees to see reporting chain.

**Features:**
- Shows complete chain from cluster head to logged-in employee
- Visual arrows showing hierarchy
- Color-coded by role
- Employee details at each level

---

### EmployeeDetailsModal.tsx
**Path:** `/components/EmployeeDetailsModal.tsx`

**Purpose:** Modal popup showing complete employee information.

**Features:**
- Personal details
- Role and designation
- Store/production house assignment
- Manager and cluster head
- Joining date
- Employment type
- Actions (edit, delete, reset password)

---

### HierarchyManagement.tsx
**Path:** `/components/HierarchyManagement.tsx`

**Purpose:** Manage organizational hierarchy and assignments.

**Features:**
- Assign managers to employees
- Reassign employees between stores
- View unassigned employees
- Bulk assignment operations

---

## Attendance & Leave Components

### AttendancePortal.tsx
**Path:** `/components/AttendancePortal.tsx`

**Purpose:** Main attendance management interface for managers.

**Features:**
- Tabbed interface:
  - Approve Leaves
  - Employee Hierarchy
  - Assign Managers
  - Hierarchy View
- Navigation between attendance features

---

### EmployeeLeave.tsx
**Path:** `/components/EmployeeLeave.tsx`

**Purpose:** Employee interface for applying for leave.

**Features:**
- Apply for leave
- View leave history
- Check leave balance (12 days/year)
- See approval status
- View rejection reasons

---

### ApproveLeaves.tsx
**Path:** `/components/ApproveLeaves.tsx`

**Purpose:** Manager interface for approving/rejecting leave applications.

**Features:**
- View pending leave requests
- Approve with one click
- Reject with reason
- Filter by status
- View employee details
- Leave balance checking

---

### EmployeeTimesheet.tsx
**Path:** `/components/EmployeeTimesheet.tsx`

**Purpose:** Employee timesheet submission (legacy).

**Note:** Currently minimal implementation, can be expanded for detailed time tracking.

---

### ApproveTimesheets.tsx
**Path:** `/components/ApproveTimesheets.tsx`

**Purpose:** Manager approval of employee timesheets.

**Note:** Currently minimal implementation.

---

## Payroll Components

### PayrollManagement.tsx
**Path:** `/components/PayrollManagement.tsx`

**Purpose:** Manage employee payouts and salary disbursements.

**Features:**
- Record monthly payouts
- Employee-wise payout entry
- Bulk payout entry
- Payout history
- Date filtering
- Export payroll data
- Payout summaries

---

## Sales Components

### SalesManagement.tsx
**Path:** `/components/SalesManagement.tsx`

**Purpose:** Record and manage sales data (legacy).

**Features:**
- Daily sales entry
- Payment mode tracking
- Cash reconciliation
- Sales approval workflow

---

### SalesData.tsx
**Path:** `/components/SalesData.tsx`

**Purpose:** Category-wise daily sales recording.

**Features:**
- 7 momo category sales input
- Date selection
- Store selection
- Sales history
- Edit/delete entries
- Revenue calculation

---

### DataCapture.tsx
**Path:** `/components/DataCapture.tsx`

**Purpose:** Quick data entry interface for daily operations.

**Features:**
- Simplified sales entry
- Quick inventory updates
- Mobile-friendly interface

---

## Analytics Components

### Analytics.tsx
**Path:** `/components/Analytics.tsx`

**Purpose:** Main analytics dashboard with multiple views.

**Features:**
- Tabbed interface:
  - Store Analytics
  - Production Analytics
  - Recalibration Reports
- Date range filtering
- Store/production house filtering
- Export capabilities

**Store Analytics:**
- Revenue trends
- Sales by category
- Inventory turnover
- Overhead costs
- Profitability analysis

**Production Analytics:**
- Production output
- Wastage analysis
- Efficiency metrics
- Request fulfillment rates

---

### StorePerformanceComparison.tsx
**Path:** `/components/StorePerformanceComparison.tsx`

**Purpose:** Compare performance across multiple stores.

**Features:**
- Side-by-side store comparison
- Revenue comparison
- Sales volume comparison
- Profitability metrics
- Trend analysis
- Visual charts

---

### PredictiveAnalytics.tsx
**Path:** `/components/PredictiveAnalytics.tsx`

**Purpose:** AI/ML-based inventory forecasting and predictions.

**Features:**
- Demand forecasting
- Stock-out predictions
- Reorder point suggestions
- Seasonal trend analysis
- Inventory optimization

---

### ReportsVisualization.tsx
**Path:** `/components/ReportsVisualization.tsx`

**Purpose:** Visual reports and charts for business insights.

**Features:**
- Custom date range reports
- Multiple chart types
- Export as PDF/Excel
- Shareable reports

---

## Store Components

### StoreManagement.tsx
**Path:** `/components/StoreManagement.tsx`

**Purpose:** Manage stores and store assignments.

**Features:**
- Create new stores
- Edit store details
- Assign managers to stores
- Assign production houses to stores
- View store list
- Delete stores

---

### StoreSelector.tsx
**Path:** `/components/StoreSelector.tsx`

**Purpose:** Dropdown for selecting stores (used in various components).

**Features:**
- Store list dropdown
- "All Stores" option for cluster heads
- Current selection display
- Store filtering

---

### StoreStockStatus.tsx
**Path:** `/components/StoreStockStatus.tsx`

**Purpose:** Real-time stock status for individual stores.

**Features:**
- Current stock levels
- Stock trends
- Low stock alerts
- Reorder suggestions

---

## Cluster Management Components

### ClusterManagement.tsx
**Path:** `/components/ClusterManagement.tsx`

**Purpose:** Manage cluster head assignments to stores and production houses.

**Features:**
- Assign stores to cluster heads
- Assign production houses to cluster heads
- View current assignments
- Multi-select assignment UI
- Assignment history

---

## Notification Components

### Notifications.tsx
**Path:** `/components/Notifications.tsx`

**Purpose:** Real-time notification center.

**Features:**
- Notification bell icon with unread count
- Dropdown notification list
- Mark as read
- Mark all as read
- Notification types:
  - Production requests
  - Stock requests
  - Leave applications
  - Low stock alerts
  - Recalibration approvals
- Click to view related item

---

### PushNotificationSetup.tsx
**Path:** `/components/PushNotificationSetup.tsx`

**Purpose:** Setup interface for push notifications.

**Features:**
- Request notification permission
- Subscribe to push notifications
- Test notification
- Unsubscribe option

---

## Utility Components

### DatePicker.tsx
**Path:** `/components/DatePicker.tsx`

**Purpose:** Reusable date picker component.

**Features:**
- Calendar interface
- Date range selection
- Min/max date constraints
- Custom formatting

---

### DateSelector.tsx
**Path:** `/components/DateSelector.tsx`

**Purpose:** 7-day date selector for production management.

**Features:**
- 7-day view with navigation
- Current date highlighting
- Date selection callback
- Week navigation

---

### ThemeToggle.tsx
**Path:** `/components/ThemeToggle.tsx`

**Purpose:** Light/Dark mode theme switcher.

**Features:**
- Toggle between light and dark themes
- Persists preference in localStorage
- Smooth icon transition animation
- Respects system color scheme preference
- Sun/Moon icon indicators

**Usage:**
```typescript
<ThemeToggle />
```

---

### ExportData.tsx
**Path:** `/components/ExportData.tsx`

**Purpose:** Data export functionality.

**Features:**
- Export to Excel
- Export to CSV
- Date range filtering
- Category selection
- Custom fields

---

## Debug Components

### DebugPanel.tsx
**Path:** `/components/DebugPanel.tsx`

**Purpose:** Development debugging panel (only visible in development mode).

**Features:**
- View current state
- Test API calls
- Clear localStorage
- View console logs
- Reset database

---

### RouteDebugger.tsx
**Path:** `/components/RouteDebugger.tsx`

**Purpose:** Debug routing and navigation issues.

**Features:**
- Current route display
- Navigation history
- Route parameters
- Query strings

---

## UI Components

All UI components are in `/components/ui/` directory. These are reusable, styled components based on shadcn/ui:

### Core UI Components
- `button.tsx` - Button variants
- `input.tsx` - Text inputs
- `select.tsx` - Dropdown selects
- `textarea.tsx` - Multi-line text input
- `checkbox.tsx` - Checkboxes
- `radio-group.tsx` - Radio buttons
- `switch.tsx` - Toggle switches
- `slider.tsx` - Range sliders

### Layout Components
- `card.tsx` - Card containers
- `dialog.tsx` - Modal dialogs
- `sheet.tsx` - Side panels
- `tabs.tsx` - Tabbed interfaces
- `accordion.tsx` - Collapsible sections
- `separator.tsx` - Dividers
- `scroll-area.tsx` - Scrollable containers

### Feedback Components
- `alert.tsx` - Alert messages
- `alert-dialog.tsx` - Confirmation dialogs
- `toast.tsx` / `sonner.tsx` - Toast notifications
- `progress.tsx` - Progress bars
- `skeleton.tsx` - Loading skeletons
- `badge.tsx` - Status badges

### Data Display
- `table.tsx` - Data tables
- `chart.tsx` - Chart wrapper
- `avatar.tsx` - User avatars
- `tooltip.tsx` - Hover tooltips
- `popover.tsx` - Popup content

### Navigation
- `navigation-menu.tsx` - Navigation menus
- `breadcrumb.tsx` - Breadcrumb navigation
- `pagination.tsx` - Page navigation
- `menubar.tsx` - Menu bars
- `dropdown-menu.tsx` - Dropdown menus
- `context-menu.tsx` - Right-click menus

### Specialized
- `calendar.tsx` - Calendar picker
- `command.tsx` - Command palette
- `form.tsx` - Form helpers
- `hover-card.tsx` - Hover cards
- `carousel.tsx` - Image carousels
- `collapsible.tsx` - Collapsible content
- `drawer.tsx` - Drawer panels
- `resizable.tsx` - Resizable panels
- `sidebar.tsx` - Sidebar layout
- `toggle.tsx` - Toggle buttons
- `toggle-group.tsx` - Toggle groups

---

## Component Usage Guidelines

### Import Pattern
```typescript
import { ComponentName } from './components/ComponentName';
```

### Props Pattern
Always define prop types using TypeScript interfaces:
```typescript
interface ComponentProps {
  requiredProp: string;
  optionalProp?: number;
  onAction: (data: any) => void;
}
```

### State Management
- Use `useState` for local component state
- Use props for parent-child communication
- Use context via `InventoryContextType` for global operations

### Error Handling
All components should handle errors gracefully:
```typescript
try {
  await apiCall();
} catch (error) {
  console.error('Error:', error);
  // Show user-friendly error message
}
```

### Loading States
Show loading indicators for async operations:
```typescript
const [loading, setLoading] = useState(false);

// In render:
{loading && <Skeleton />}
```

---

## Component Lifecycle

### Mount
```typescript
useEffect(() => {
  // Initialize component
  loadData();
}, []); // Empty deps = run once on mount
```

### Update
```typescript
useEffect(() => {
  // React to prop/state changes
  updateData();
}, [dependency]); // Runs when dependency changes
```

### Unmount
```typescript
useEffect(() => {
  return () => {
    // Cleanup
    cancelRequests();
  };
}, []);
```

---

## Best Practices

1. **Keep components focused** - Each component should have a single responsibility
2. **Use TypeScript** - Always define types for props and state
3. **Handle errors** - Never let errors crash the UI
4. **Show loading states** - Always indicate when data is loading
5. **Use meaningful names** - Component and variable names should be descriptive
6. **Comment complex logic** - Add comments for non-obvious code
7. **Reuse UI components** - Use components from `/components/ui/`
8. **Follow the style guide** - Maintain consistent code formatting
9. **Test your components** - Ensure components work in all scenarios
10. **Optimize performance** - Use React.memo, useMemo, useCallback where appropriate

---

## Version
Last Updated: January 2, 2026