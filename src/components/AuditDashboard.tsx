import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { LogOut, BarChart3, DollarSign, Package, Users, Factory, Eye, ShieldCheck, KeyRound } from 'lucide-react';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { EmptyState } from './ui/empty-state';
import { IconButton } from './ui/icon-button';
import { ListGroup, ListRow } from './ui/list-row';
import { StatusChip } from './ui/status-chip';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import type { InventoryItem, OverheadItem, FixedCostItem, SalesData, ProductionData, InventoryContextType } from '../App';
import * as api from '../utils/api';
import { Analytics } from './Analytics';
import { InventoryView } from './InventoryView';
import { PayrollManagement } from './PayrollManagement';
import { ProductionManagement } from './ProductionManagement';
import { getTodayIST, formatDateIST } from '../utils/timezone';
import { salesDayStatus, hasRealCashCount } from '../utils/cashCount';

type Props = {
 user: { email: string; name: string; role: string; employeeId: string | null; accessToken: string };
 inventory: InventoryItem[];
 overheads: OverheadItem[];
 fixedCosts: FixedCostItem[];
 salesData: SalesData[];
 categorySalesData: api.SalesDataRecord[];
 productionData: ProductionData[];
 productionHouses: api.ProductionHouse[];
 stockRequests: api.StockRequest[];
 productionRequests: api.ProductionRequest[];
 employees: api.Employee[];
 stores: api.Store[];
 inventoryItems: api.DynamicInventoryItem[];
 onLogout: () => void;
 // Opens App's change-password sheet (components/PasswordSecurity.tsx).
 onChangePassword?: () => void;
 onDataUpdate: (accessToken: string) => Promise<void>;
 // The app shell drives the view from its own tabs and draws its own top bar (WP0b).
 view?: 'analytics' | 'inventory' | 'sales' | 'production' | 'payroll';
 hideNav?: boolean;
};

export function AuditDashboard({
 user,
 inventory,
 overheads,
 fixedCosts,
 salesData,
 categorySalesData,
 productionData,
 productionHouses,
 stockRequests,
 productionRequests,
 employees,
 stores,
 inventoryItems,
 onLogout,
 onChangePassword,
 onDataUpdate,
 view,
 hideNav = false
}: Props) {
 const [ownView, setActiveView] = useState<'analytics' | 'inventory' | 'sales' | 'production' | 'payroll'>('analytics');
 const activeView = view ?? ownView;
 const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
 const [selectedDate, setSelectedDate] = useState<string>(getTodayIST());
 const [salesRowsShown, setSalesRowsShown] = useState(50);

 // Zomato/Swiggy sales, old payout entries and settlement files aren't passed in by App, and
 // without them Analytics showed no online revenue or commission for the auditor - so this
 // read-only dashboard loads them itself.
 const [onlineSalesData, setOnlineSalesData] = useState<api.OnlineSalesEntry[]>([]);
 const [onlinePayoutData, setOnlinePayoutData] = useState<api.OnlinePayoutEntry[]>([]);
 const [aggregatorSettlements, setAggregatorSettlements] = useState<api.AggregatorSettlement[]>([]);
 useEffect(() => {
 if (!user.accessToken) return;
 let cancelled = false;
 Promise.all([
 api.getOnlineSalesData(user.accessToken),
 api.getOnlinePayoutData(user.accessToken),
 api.getAggregatorSettlements(user.accessToken).catch(() => []),
 ]).then(([online, payouts, settlements]) => {
 if (cancelled) return;
 setOnlineSalesData(online || []);
 setOnlinePayoutData(payouts || []);
 setAggregatorSettlements(settlements || []);
 });
 return () => { cancelled = true; };
 }, [user.accessToken]);

 // Newest first, without sorting the prop array in place (that reordered App's own copy).
 const sortedSales = useMemo(() => [...salesData].sort((a, b) => String(b.date).localeCompare(String(a.date))), [salesData]);
 const onlineByStoreDay = useMemo(() => {
 const map = new Map<string, number>();
 onlineSalesData.forEach((o) => {
 const key = `${o.storeId}|${o.date}`;
 map.set(key, (map.get(key) || 0) + (o.zomatoSales || 0) + (o.swiggySales || 0));
 });
 return map;
 }, [onlineSalesData]);

 // Create a read-only context object for components that need it
 const contextValue: InventoryContextType = {
 inventory,
 overheads,
 fixedCosts,
 salesData,
 categorySalesData,
 productionData,
 productionHouses,
 stockRequests,
 productionRequests,
 onlineCashRecalibrations: [],
 onlineSalesData,
 onlinePayoutData,
 aggregatorSettlements,
 stores,
 managedStoreIds: [],
 managedProductionHouseIds: [],
 inventoryItems,
 loadInventoryItems: async () => {}, // No-op for audit
 addInventoryItem: async () => {}, // No-op for audit
 addOverheadItem: async () => {}, // No-op for audit
 addFixedCostItem: async () => {}, // No-op for audit
 updateInventoryItem: async () => {}, // No-op for audit
 updateOverheadItem: async () => {}, // No-op for audit
 updateFixedCostItem: async () => {}, // No-op for audit
 deleteInventoryItem: async () => {}, // No-op for audit
 deleteOverheadItem: async () => {}, // No-op for audit
 deleteFixedCostItem: async () => {}, // No-op for audit
 addSalesData: async () => {}, // No-op for audit
 updateSalesData: async () => {}, // No-op for audit
 approveSalesData: async () => {}, // No-op for audit
 requestSalesApproval: async () => {}, // No-op for audit
 approveDiscrepancy: async () => {}, // No-op for audit
 rejectDiscrepancy: async () => {}, // No-op for audit
 addProductionData: async () => {}, // No-op for audit
 updateProductionData: async () => {}, // No-op for audit
 approveProductionData: async () => {}, // No-op for audit
 addProductionHouse: async () => {}, // No-op for audit
 updateProductionHouse: async () => {}, // No-op for audit
 updateProductionHouseInventory: async () => {}, // No-op for audit
 deleteProductionHouse: async () => {}, // No-op for audit
 setProductionHouses: () => {}, // No-op for audit
 createStockRequest: async () => {}, // No-op for audit
 fulfillStockRequest: async () => {}, // No-op for audit
 cancelStockRequest: async () => {}, // No-op for audit
 isManager: false,
 user: user,
 refreshData: () => onDataUpdate(user.accessToken),
 // This read-only dashboard has no manual "Refresh data" button of its own to bump this
 // from, so it's a static 0 - components watching it (see App.tsx's dataRefreshedAt) just
 // never see it change here, same as before this field existed.
 dataRefreshedAt: 0,
 };

 const navItems = [
 { id: 'analytics' as const, label: 'Insights', icon: BarChart3 },
 { id: 'inventory' as const, label: 'Expenses', icon: Package },
 { id: 'sales' as const, label: 'Sales', icon: DollarSign },
 { id: 'production' as const, label: 'Production', icon: Factory },
 { id: 'payroll' as const, label: 'Pay', icon: Users },
 ];
 const salesShown = sortedSales.slice(0, salesRowsShown);
 const readOnly = <StatusChip tone="neutral" icon={Eye}>Read-only</StatusChip>;
 // One template for the read-only views: a title with the read-only chip, then the screen.
 const section = (title: string, sub: string, children: React.ReactNode) => (
 <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:px-8 lg:py-6">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div className="min-w-0">
 <h2 className="text-title font-semibold text-text">{title}</h2>
 <p className="text-body-sm text-text-2">{sub}</p>
 </div>
 {readOnly}
 </div>
 {children}
 </div>
 );

 return (
 <div className="min-h-full bg-bg">
 {/* Its own top bar only outside the app shell (the shell draws the bar and the tabs). */}
 {!hideNav && (
 <header className="sticky top-0 z-(--z-sticky) border-b border-border bg-surface">
 <div className="mx-auto flex min-h-14 max-w-7xl items-center gap-3 px-4 lg:px-8">
 <ShieldCheck className="size-6 shrink-0 text-text-2" aria-hidden="true" />
 <div className="min-w-0 flex-1">
 <h1 className="truncate text-title font-semibold text-text">Bunny Momos · Audit</h1>
 <p className="truncate text-caption text-text-3">{user.name} · read-only</p>
 </div>
 {onChangePassword && <IconButton label="Change password" icon={<KeyRound />} onClick={onChangePassword} />}
 <IconButton label="Log out" icon={<LogOut />} variant="danger-ghost" onClick={onLogout} />
 </div>
 <Tabs value={activeView} onValueChange={(v) => setActiveView(v as typeof ownView)}>
 <div className="mx-auto max-w-7xl lg:px-4">
 <TabsList aria-label="Audit sections" className="border-b-0">
 {navItems.map((item) => (
 <TabsTrigger key={item.id} value={item.id}><item.icon aria-hidden="true" />{item.label}</TabsTrigger>
 ))}
 </TabsList>
 </div>
 </Tabs>
 </header>
 )}

 <div className="mx-auto max-w-7xl px-4 pt-4 lg:px-8">
 <Callout tone="info" icon={Eye} title="Audit mode: read-only">You can see all the records here, but not add, change or delete any.</Callout>
 </div>

 {activeView === 'analytics' && (
 <Analytics
 context={contextValue}
 selectedStoreId={selectedStoreId}
 />
 )}

 {activeView === 'inventory' && section('Expenses', 'Purchases, running and fixed costs', (
 <InventoryView
 context={contextValue}
 selectedStoreId={selectedStoreId}
 />
 ))}

 {activeView === 'sales' && section('Sales', `${sortedSales.length} day closes, newest first`, (
 <>
 {/* Phones: a list; from 1024 px: the table */}
 <ListGroup className="lg:hidden" empty={<EmptyState compact icon={DollarSign} title="No sales yet" />}>
 {salesShown.map((sale) => {
 const store = stores.find(s => s.id === sale.storeId);
 const online = onlineByStoreDay.get(`${sale.storeId}|${sale.date}`) ?? (sale.posOnlineSales || 0);
 return (
 <ListRow
 key={sale.id}
 title={`${formatDateIST(sale.date)} · ${store?.name || 'Unknown store'}`}
 subtitle={`Counter ₹${(sale.offlineSales || 0).toLocaleString('en-IN')} · Online ₹${online.toLocaleString('en-IN')} · Cash ₹${(sale.cashAmount || 0).toLocaleString('en-IN')} · Paytm ₹${(sale.paytmAmount || 0).toLocaleString('en-IN')}`}
 trailing={<StatusChip tone={!hasRealCashCount(sale) ? 'neutral' : sale.approvalStatus === 'approved' ? 'success' : 'warning'}>{salesDayStatus(sale)}</StatusChip>}
 />
 );
 })}
 </ListGroup>
 <div className="hidden overflow-hidden rounded-lg border border-border bg-surface lg:block">
 <table className="w-full">
 <thead className="border-b border-border bg-surface-2">
 <tr>
 <th className="px-4 py-3 text-left text-label font-semibold text-text-2">Date</th>
 <th className="px-4 py-3 text-left text-label font-semibold text-text-2">Store</th>
 <th className="px-4 py-3 text-right text-label font-semibold text-text-2">Counter sales</th>
 <th className="px-4 py-3 text-right text-label font-semibold text-text-2">Online sales</th>
 <th className="px-4 py-3 text-right text-label font-semibold text-text-2">Cash</th>
 <th className="px-4 py-3 text-right text-label font-semibold text-text-2">Paytm</th>
 <th className="px-4 py-3 text-center text-label font-semibold text-text-2">Status</th>
 </tr>
 </thead>
 <tbody>
 {salesData.length === 0 ? (
 <tr>
 <td colSpan={7}><EmptyState compact icon={DollarSign} title="No sales yet" /></td>
 </tr>
 ) : (
 salesShown.map((sale) => {
 const store = stores.find(s => s.id === sale.storeId);
 // Online sales live in their own table now (the record's own onlineSales is always 0).
 const online = onlineByStoreDay.get(`${sale.storeId}|${sale.date}`) ?? (sale.posOnlineSales || 0);
 return (
 <tr key={sale.id} className="border-b border-border last:border-b-0">
 <td className="whitespace-nowrap px-4 py-3 text-body-sm text-text">{formatDateIST(sale.date)}</td>
 <td className="px-4 py-3 text-body-sm text-text-2">{store?.name || 'Unknown store'}</td>
 <td className="num px-4 py-3 text-right text-body-sm text-text">₹{(sale.offlineSales || 0).toLocaleString('en-IN')}</td>
 <td className="num px-4 py-3 text-right text-body-sm text-text">₹{online.toLocaleString('en-IN')}</td>
 <td className="num px-4 py-3 text-right text-body-sm text-text">₹{(sale.cashAmount || 0).toLocaleString('en-IN')}</td>
 <td className="num px-4 py-3 text-right text-body-sm text-text">₹{(sale.paytmAmount || 0).toLocaleString('en-IN')}</td>
 <td className="px-4 py-3 text-center">
 <StatusChip tone={!hasRealCashCount(sale) ? 'neutral' : sale.approvalStatus === 'approved' ? 'success' : 'warning'}>{salesDayStatus(sale)}</StatusChip>
 </td>
 </tr>
 );
 })
 )}
 </tbody>
 </table>
 </div>
 {sortedSales.length > salesRowsShown && (
 <div className="flex items-center justify-between gap-3 text-body-sm text-text-2">
 <span>Showing {salesRowsShown} of {sortedSales.length} days</span>
 <Button variant="secondary" onClick={() => setSalesRowsShown((n) => n + 50)}>Show 50 more</Button>
 </div>
 )}
 </>
 ))}

 {activeView === 'production' && section('Production', 'Batches and approvals', (
 <ProductionManagement
 context={contextValue}
 selectedStoreId={selectedStoreId}
 />
 ))}

 {activeView === 'payroll' && section('Pay', 'Payouts and payslips', (
 <PayrollManagement
 userRole="audit"
 selectedDate={selectedDate}
 userName={user.name}
 />
 ))}
 </div>
 );
}
