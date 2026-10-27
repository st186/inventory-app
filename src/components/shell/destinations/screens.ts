// Today's screens, each loaded on first use (moved here from App.tsx with the same chunks, so the
// first frame stays as small as before). Screen packages edit these components; the wrappers in
// this folder only choose which one shows under which tab, with which props.
import { lazy } from 'react';

export const Analytics = lazy(() => import('../../Analytics').then((m) => ({ default: m.Analytics })));
export const ProductionRequests = lazy(() => import('../../ProductionRequests').then((m) => ({ default: m.ProductionRequests })));
export const SalesManagement = lazy(() => import('../../SalesManagement').then((m) => ({ default: m.SalesManagement })));
export const SalesView = lazy(() => import('../../SalesView').then((m) => ({ default: m.SalesView })));
export const InventoryManagement = lazy(() => import('../../InventoryManagement').then((m) => ({ default: m.InventoryManagement })));
export const ProductionManagement = lazy(() => import('../../ProductionManagement').then((m) => ({ default: m.ProductionManagement })));
export const AdvancedInventoryManagement = lazy(() => import('../../AdvancedInventoryManagement').then((m) => ({ default: m.AdvancedInventoryManagement })));
export const StockOutLog = lazy(() => import('../../StockOutLog').then((m) => ({ default: m.StockOutLog })));
export const RiderTrips = lazy(() => import('../../RiderTrips').then((m) => ({ default: m.RiderTrips })));
export const RiderProfile = lazy(() => import('../../RiderProfile').then((m) => ({ default: m.RiderProfile })));
export const IncomingDeliveries = lazy(() => import('../../dispatch/IncomingDeliveries').then((m) => ({ default: m.IncomingDeliveries })));
export const EmployeeManagement = lazy(() => import('../../EmployeeManagement').then((m) => ({ default: m.EmployeeManagement })));
export const AttendancePortal = lazy(() => import('../../AttendancePortal').then((m) => ({ default: m.AttendancePortal })));
export const PayrollManagement = lazy(() => import('../../PayrollManagement').then((m) => ({ default: m.PayrollManagement })));
export const EmployeeDashboard = lazy(() => import('../../EmployeeDashboard').then((m) => ({ default: m.EmployeeDashboard })));
export const HierarchyManagement = lazy(() => import('../../HierarchyManagement').then((m) => ({ default: m.HierarchyManagement })));
export const TeamKpis = lazy(() => import('../../kpi/TeamKpis').then((m) => ({ default: m.TeamKpis })));
export const MyKpis = lazy(() => import('../../kpi/MyKpis').then((m) => ({ default: m.MyKpis })));
export const WorkplaceChecks = lazy(() => import('../../workplace/WorkplaceChecks').then((m) => ({ default: m.WorkplaceChecks })));
export const AssetsManagement = lazy(() => import('../../AssetsManagement').then((m) => ({ default: m.AssetsManagement })));
export const InventoryItemsManagement = lazy(() => import('../../InventoryItemsManagement').then((m) => ({ default: m.InventoryItemsManagement })));
export const ExportData = lazy(() => import('../../ExportData').then((m) => ({ default: m.ExportData })));
export const BackupRestore = lazy(() => import('../../BackupRestore').then((m) => ({ default: m.BackupRestore })));
